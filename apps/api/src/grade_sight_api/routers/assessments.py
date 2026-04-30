"""Assessments router — list, create, detail, delete.

POST /api/assessments creates the assessment + N AssessmentPage rows in one
transaction and returns N presigned PUT URLs. Browser uploads file bytes
directly to R2 (FastAPI not in the upload path).

GET /api/assessments returns recent assessments with first-page thumbnail
+ page count.

GET /api/assessments/{id} returns full detail with one presigned GET URL
per page.

DELETE /api/assessments/{id} soft-deletes the assessment.

All endpoints tenant-scoped via user.organization_id.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
from ..models.assessment import Assessment, AssessmentStatus
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.assessment_page import AssessmentPage
from ..models.diagnostic_review import DiagnosticReview
from ..models.error_category import ErrorCategory
from ..models.error_pattern import ErrorPattern
from ..models.error_subcategory import ErrorSubcategory
from ..models.problem_observation import ProblemObservation
from ..models.student import Student
from ..models.user import User
from ..schemas.assessments import (
    AssessmentCreateRequest,
    AssessmentCreateResponse,
    AssessmentDetailAnswerKey,
    AssessmentDetailPage,
    AssessmentDetailResponse,
    AssessmentDiagnosisResponse,
    AssessmentListItem,
    AssessmentListResponse,
    AssessmentPageUploadIntent,
    ProblemObservationResponse,
)
from ..services import engine_service, storage_service
from ..services.call_context import CallContext
from ..services.diagnostic_review_service import OverlayInputs, apply_reviews_to_problems

MAX_PAGES_PER_ASSESSMENT = 20

router = APIRouter()


def _safe_extension(filename: str) -> str:
    """Lowercase file extension without the dot, defaulting to 'bin'."""
    suffix = Path(filename).suffix.lstrip(".").lower()
    return suffix or "bin"


async def _build_diagnosis_response(
    db: AsyncSession, diagnosis_id: UUID
) -> AssessmentDiagnosisResponse:
    """Load a diagnosis with its observations and joined error_pattern + category info.

    Returns the API response shape with slugs/names denormalized for the frontend.
    """
    diag_result = await db.execute(
        select(AssessmentDiagnosis).where(
            AssessmentDiagnosis.id == diagnosis_id,
            AssessmentDiagnosis.deleted_at.is_(None),
        )
    )
    diagnosis = diag_result.scalar_one()

    obs_result = await db.execute(
        select(
            ProblemObservation,
            ErrorPattern.slug.label("pattern_slug"),
            ErrorPattern.name.label("pattern_name"),
            ErrorCategory.slug.label("category_slug"),
        )
        .join(
            ErrorPattern,
            ProblemObservation.error_pattern_id == ErrorPattern.id,
            isouter=True,
        )
        .join(
            ErrorSubcategory,
            ErrorPattern.subcategory_id == ErrorSubcategory.id,
            isouter=True,
        )
        .join(
            ErrorCategory,
            ErrorSubcategory.category_id == ErrorCategory.id,
            isouter=True,
        )
        .where(
            ProblemObservation.diagnosis_id == diagnosis.id,
            ProblemObservation.deleted_at.is_(None),
        )
        .order_by(ProblemObservation.problem_number)
    )

    problems: list[ProblemObservationResponse] = []
    for obs, pattern_slug, pattern_name, category_slug in obs_result.all():
        problems.append(
            ProblemObservationResponse(
                id=obs.id,
                problem_number=obs.problem_number,
                page_number=obs.page_number,
                student_answer=obs.student_answer,
                correct_answer=obs.correct_answer,
                is_correct=obs.is_correct,
                error_pattern_slug=pattern_slug,
                error_pattern_name=pattern_name,
                error_category_slug=category_slug,
                error_description=obs.error_description,
                solution_steps=obs.solution_steps,
            )
        )

    return AssessmentDiagnosisResponse(
        id=diagnosis.id,
        model=diagnosis.model,
        overall_summary=diagnosis.overall_summary,
        cost_usd=float(diagnosis.cost_usd),
        latency_ms=diagnosis.latency_ms,
        created_at=diagnosis.created_at,
        problems=problems,
        analysis_mode=cast(
            Literal["auto_grade", "with_key", "already_graded"],
            diagnosis.analysis_mode,
        ),
        total_problems_seen=diagnosis.total_problems_seen,
    )


@router.get("/api/assessments", response_model=AssessmentListResponse)
async def list_assessments(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentListResponse:
    """List recent assessments + first-page thumbnail URL + page count."""
    if user.organization_id is None:
        return AssessmentListResponse(assessments=[])

    page_count_subq = (
        select(
            AssessmentPage.assessment_id.label("assessment_id"),
            func.count(AssessmentPage.id).label("page_count"),
        )
        .where(AssessmentPage.deleted_at.is_(None))
        .group_by(AssessmentPage.assessment_id)
        .subquery()
    )

    first_page_subq = (
        select(
            AssessmentPage.assessment_id.label("assessment_id"),
            AssessmentPage.s3_url.label("first_page_key"),
        )
        .where(
            AssessmentPage.page_number == 1,
            AssessmentPage.deleted_at.is_(None),
        )
        .subquery()
    )

    result = await db.execute(
        select(
            Assessment,
            Student.full_name,
            page_count_subq.c.page_count,
            first_page_subq.c.first_page_key,
        )
        .join(Student, Assessment.student_id == Student.id)
        .join(
            page_count_subq,
            Assessment.id == page_count_subq.c.assessment_id,
            isouter=True,
        )
        .join(
            first_page_subq,
            Assessment.id == first_page_subq.c.assessment_id,
            isouter=True,
        )
        .where(
            Assessment.organization_id == user.organization_id,
            Assessment.deleted_at.is_(None),
        )
        .order_by(Assessment.uploaded_at.desc())
        .limit(limit)
    )

    items: list[AssessmentListItem] = []
    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="assessment_list_thumbnails",
        contains_pii=False,
        audit_reason="render dashboard recent list thumbnails",
    )
    for assessment, student_name, page_count, first_page_key in result.all():
        if first_page_key is None:
            # Skip rows that somehow have no page (shouldn't happen post-migration).
            continue
        thumb_url = await storage_service.get_download_url(
            ctx=ctx,
            key=first_page_key,
            db=db,
        )
        items.append(
            AssessmentListItem(
                id=assessment.id,
                student_id=assessment.student_id,
                student_name=student_name,
                page_count=int(page_count or 0),
                first_page_thumbnail_url=thumb_url,
                status=assessment.status,
                uploaded_at=assessment.uploaded_at,
            )
        )
    return AssessmentListResponse(assessments=items)


@router.post(
    "/api/assessments",
    response_model=AssessmentCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assessment(
    payload: AssessmentCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentCreateResponse:
    """Create a pending assessment with N pages, return N presigned PUT URLs."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    if not payload.files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="files is required",
        )
    if len(payload.files) > MAX_PAGES_PER_ASSESSMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"max {MAX_PAGES_PER_ASSESSMENT} pages per assessment",
        )
    for f in payload.files:
        if not f.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="content_type must be image/*",
            )
        if not f.filename.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="filename is required",
            )

    student_result = await db.execute(
        select(Student).where(
            Student.id == payload.student_id,
            Student.deleted_at.is_(None),
        )
    )
    student = student_result.scalar_one_or_none()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="student not found",
        )
    if student.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="student does not belong to your organization",
        )

    # Validate answer_key_id if provided
    if payload.answer_key_id is not None:
        key_result = await db.execute(
            select(AnswerKey).where(
                AnswerKey.id == payload.answer_key_id,
                AnswerKey.deleted_at.is_(None),
            )
        )
        answer_key = key_result.scalar_one_or_none()
        if answer_key is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="answer key not found",
            )
        if answer_key.organization_id != user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="answer key does not belong to your organization",
            )

    assessment = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
        answer_key_id=payload.answer_key_id,
        already_graded=payload.already_graded,
        review_all=payload.review_all,
    )
    db.add(assessment)
    await db.flush()

    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="assessment_upload_url",
        contains_pii=True,
        audit_reason="upload student assessment image",
    )

    # First pass: add all page rows, flush once.
    pages: list[AssessmentPage] = []
    for index, f in enumerate(payload.files, start=1):
        filename = f.filename.strip()
        ext = _safe_extension(filename)
        key = (
            f"assessments/{user.organization_id}/{student.id}/"
            f"{assessment.id}/page-{index:03d}.{ext}"
        )
        page = AssessmentPage(
            assessment_id=assessment.id,
            page_number=index,
            s3_url=key,
            original_filename=filename,
            content_type=f.content_type,
            organization_id=user.organization_id,
        )
        db.add(page)
        pages.append(page)
    await db.flush()

    # Second pass: generate presigned upload URLs (each writes audit_log).
    intents: list[AssessmentPageUploadIntent] = []
    for page, f in zip(pages, payload.files, strict=True):
        upload_url = await storage_service.get_upload_url(
            ctx=ctx,
            key=page.s3_url,
            content_type=f.content_type,
            db=db,
        )
        intents.append(
            AssessmentPageUploadIntent(
                page_number=page.page_number,
                key=page.s3_url,
                upload_url=upload_url,
            )
        )

    return AssessmentCreateResponse(
        assessment_id=assessment.id,
        pages=intents,
    )


@router.get(
    "/api/assessments/{assessment_id}",
    response_model=AssessmentDetailResponse,
)
async def get_assessment_detail(
    assessment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentDetailResponse:
    """Full detail: student name, status, all pages with presigned view URLs."""
    result = await db.execute(
        select(Assessment, Student.full_name)
        .join(Student, Assessment.student_id == Student.id)
        .where(
            Assessment.id == assessment_id,
            Assessment.deleted_at.is_(None),
        )
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="assessment not found",
        )
    assessment, student_name = row
    if assessment.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="assessment does not belong to your organization",
        )

    pages_result = await db.execute(
        select(AssessmentPage)
        .where(
            AssessmentPage.assessment_id == assessment.id,
            AssessmentPage.deleted_at.is_(None),
        )
        .order_by(AssessmentPage.page_number)
    )
    pages = pages_result.scalars().all()

    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="assessment_detail_view",
        contains_pii=True,
        audit_reason="render assessment detail page",
    )
    detail_pages: list[AssessmentDetailPage] = []
    for p in pages:
        view_url = await storage_service.get_download_url(
            ctx=ctx,
            key=p.s3_url,
            db=db,
        )
        detail_pages.append(
            AssessmentDetailPage(
                page_number=p.page_number,
                original_filename=p.original_filename,
                view_url=view_url,
            )
        )

    diagnosis_payload: AssessmentDiagnosisResponse | None = None
    diag_result = await db.execute(
        select(AssessmentDiagnosis.id).where(
            AssessmentDiagnosis.assessment_id == assessment.id,
            AssessmentDiagnosis.deleted_at.is_(None),
        )
    )
    diagnosis_id = diag_result.scalar_one_or_none()
    if diagnosis_id is not None:
        diagnosis_payload = await _build_diagnosis_response(db, diagnosis_id)

    # Overlay active teacher reviews onto problems so callers always see
    # effective (post-review) state. Problems with no review are passed through
    # unchanged (review=None). Only runs when a diagnosis with problems exists.
    if diagnosis_payload is not None and diagnosis_payload.problems:
        reviews_result = await db.execute(
            select(DiagnosticReview).where(
                DiagnosticReview.assessment_id == assessment.id,
                DiagnosticReview.deleted_at.is_(None),
            )
        )
        review_rows = list(reviews_result.scalars().all())

        # Collect unique pattern IDs referenced by override reviews.
        pattern_ids = {
            r.override_pattern_id
            for r in review_rows
            if r.override_pattern_id is not None
        }

        # Build pattern_index: UUID -> protocol-compatible object with
        # category_slug + category_name resolved via JOIN.
        pattern_index: dict[object, object] = {}
        if pattern_ids:
            pat_result = await db.execute(
                select(
                    ErrorPattern,
                    ErrorCategory.slug.label("cat_slug"),
                    ErrorCategory.name.label("cat_name"),
                )
                .join(
                    ErrorSubcategory,
                    ErrorPattern.subcategory_id == ErrorSubcategory.id,
                    isouter=True,
                )
                .join(
                    ErrorCategory,
                    ErrorSubcategory.category_id == ErrorCategory.id,
                    isouter=True,
                )
                .where(ErrorPattern.id.in_(pattern_ids))
            )

            class _PatternAdapter:
                def __init__(
                    self,
                    pattern: ErrorPattern,
                    cat_slug: str | None,
                    cat_name: str | None,
                ) -> None:
                    self.id = pattern.id
                    self.slug = pattern.slug
                    self.name = pattern.name
                    self.category_slug = cat_slug or ""
                    self.category_name = cat_name or ""

            for pat, cat_slug, cat_name in pat_result.all():
                pattern_index[pat.id] = _PatternAdapter(pat, cat_slug, cat_name)

        # Build reviewer-name-enriched adapter rows (matches _ReviewRow protocol).
        class _ReviewAdapter:
            def __init__(self, row: DiagnosticReview, reviewer_name: str) -> None:
                self.id = row.id
                self.problem_number = row.problem_number
                self.marked_correct = row.marked_correct
                self.override_pattern_id = row.override_pattern_id
                self.note = row.note
                self.reviewed_at = row.reviewed_at
                self.reviewer_name = reviewer_name

        adapters = []
        for r in review_rows:
            reviewer_result = await db.execute(
                select(User).where(User.id == r.reviewed_by)
            )
            reviewer = reviewer_result.scalar_one_or_none()
            if reviewer is not None:
                first = reviewer.first_name or ""
                last = reviewer.last_name or ""
                name = f"{first} {last}".strip() or reviewer.email
            else:
                name = ""
            adapters.append(_ReviewAdapter(r, name))

        overlaid_problems = apply_reviews_to_problems(
            OverlayInputs(
                problems=diagnosis_payload.problems,
                reviews=adapters,  # type: ignore[arg-type]
                pattern_index=pattern_index,  # type: ignore[arg-type]
            )
        )
        diagnosis_payload = diagnosis_payload.model_copy(
            update={"problems": overlaid_problems}
        )

    # AnswerKey.deleted_at is intentionally NOT filtered here: per Spec 12,
    # existing assessments that reference a soft-deleted key still display it
    # so historical diagnoses stay readable. The picker on /upload filters
    # deleted keys out separately via the answer_keys list endpoint.
    answer_key_payload: AssessmentDetailAnswerKey | None = None
    if assessment.answer_key_id is not None:
        ak_result = await db.execute(
            select(
                AnswerKey,
                func.count(AnswerKeyPage.id).label("page_count"),
            )
            .join(
                AnswerKeyPage,
                (AnswerKeyPage.answer_key_id == AnswerKey.id)
                & (AnswerKeyPage.deleted_at.is_(None)),
                isouter=True,
            )
            .where(AnswerKey.id == assessment.answer_key_id)
            .group_by(AnswerKey.id)
        )
        ak_row = ak_result.one_or_none()
        if ak_row is not None:
            ak, page_count = ak_row
            answer_key_payload = AssessmentDetailAnswerKey(
                id=ak.id,
                name=ak.name,
                page_count=int(page_count or 0),
            )

    return AssessmentDetailResponse(
        id=assessment.id,
        student_id=assessment.student_id,
        student_name=student_name,
        status=assessment.status,
        uploaded_at=assessment.uploaded_at,
        pages=detail_pages,
        diagnosis=diagnosis_payload,
        answer_key=answer_key_payload,
    )


@router.delete(
    "/api/assessments/{assessment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_assessment(
    assessment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Soft-delete the assessment by setting deleted_at."""
    result = await db.execute(
        select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.deleted_at.is_(None),
        )
    )
    assessment = result.scalar_one_or_none()
    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="assessment not found",
        )
    if assessment.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="assessment does not belong to your organization",
        )
    assessment.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db.flush()


@router.post(
    "/api/assessments/{assessment_id}/diagnose",
    response_model=AssessmentDiagnosisResponse,
    status_code=status.HTTP_200_OK,
)
async def diagnose_assessment_endpoint(
    assessment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentDiagnosisResponse:
    """Run the diagnostic engine against an assessment. Sync ~30s wait.

    Returns the full diagnosis + observations on success. Status codes:
    - 200 OK on success
    - 403 if cross-org
    - 404 if assessment not found
    - 409 if already diagnosed (status != pending)
    - 500 on engine failure
    """
    diagnosis = await engine_service.diagnose_assessment(
        assessment_id=assessment_id, user=user, db=db,
    )
    return await _build_diagnosis_response(db, diagnosis.id)
