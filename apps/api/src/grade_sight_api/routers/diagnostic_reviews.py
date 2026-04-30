"""Diagnostic-reviews router — create, update, soft-delete.

POST   /api/assessments/{assessment_id}/reviews
PATCH  /api/assessments/{assessment_id}/reviews/{review_id}
DELETE /api/assessments/{assessment_id}/reviews/{review_id}

Auth: strict org-match — organisation_id IS NOT NULL and caller's org
must equal the assessment's org. Parents (org=None) are denied 403.

Audit: every write logs to audit_log via write_audit_log.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.assessment import Assessment
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.diagnostic_review import DiagnosticReview
from ..models.error_pattern import ErrorPattern
from ..models.problem_observation import ProblemObservation
from ..models.user import User
from ..schemas.diagnostic_reviews import (
    DiagnosticReviewCreate,
    DiagnosticReviewOut,
    DiagnosticReviewUpdate,
)
from ..services._logging import write_audit_log
from ..services.call_context import CallContext

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _require_assessment(
    assessment_id: UUID,
    user: User,
    db: AsyncSession,
) -> Assessment:
    """Load assessment and enforce org-match auth.

    Raises:
        404 if assessment not found or soft-deleted.
        403 if caller has no org (parent) or wrong org (different teacher).
    """
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
    # Strict org-match: deny parents (org=None) and wrong-org teachers.
    if user.organization_id is None or user.organization_id != assessment.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not authorized to review this assessment",
        )
    return assessment


async def _build_review_out(
    review: DiagnosticReview,
    db: AsyncSession,
) -> DiagnosticReviewOut:
    """Construct the response schema — joins User and optionally ErrorPattern."""
    # Reviewer name
    reviewer_result = await db.execute(
        select(User).where(User.id == review.reviewed_by)
    )
    reviewer = reviewer_result.scalar_one()
    first = reviewer.first_name or ""
    last = reviewer.last_name or ""
    reviewed_by_name = f"{first} {last}".strip() or reviewer.email

    # Override pattern slug/name if set
    override_pattern_slug: str | None = None
    override_pattern_name: str | None = None
    if review.override_pattern_id is not None:
        pat_result = await db.execute(
            select(ErrorPattern).where(ErrorPattern.id == review.override_pattern_id)
        )
        pat = pat_result.scalar_one_or_none()
        if pat is not None:
            override_pattern_slug = pat.slug
            override_pattern_name = pat.name

    return DiagnosticReviewOut(
        id=review.id,
        marked_correct=review.marked_correct,
        override_pattern_id=review.override_pattern_id,
        override_pattern_slug=override_pattern_slug,
        override_pattern_name=override_pattern_name,
        note=review.note,
        reviewed_at=review.reviewed_at,
        reviewed_by_name=reviewed_by_name,
    )


async def _lookup_original_pattern_id(
    assessment_id: UUID,
    problem_number: int,
    db: AsyncSession,
) -> UUID | None:
    """Return the auto-graded error_pattern_id for this assessment + problem.

    Looks up the latest (non-deleted) AssessmentDiagnosis for the assessment,
    then finds the ProblemObservation matching problem_number. Returns None if
    no diagnosis exists or no observation for that problem.
    """
    diag_result = await db.execute(
        select(AssessmentDiagnosis).where(
            AssessmentDiagnosis.assessment_id == assessment_id,
            AssessmentDiagnosis.deleted_at.is_(None),
        )
    )
    diagnosis = diag_result.scalar_one_or_none()
    if diagnosis is None:
        return None

    obs_result = await db.execute(
        select(ProblemObservation).where(
            ProblemObservation.diagnosis_id == diagnosis.id,
            ProblemObservation.problem_number == problem_number,
            ProblemObservation.deleted_at.is_(None),
        )
    )
    obs = obs_result.scalar_one_or_none()
    if obs is None:
        return None
    return obs.error_pattern_id


def _build_ctx(user: User, request_type: str, audit_reason: str) -> CallContext:
    """Build a CallContext for audit logging. org_id guaranteed non-None here."""
    assert user.organization_id is not None  # enforced by _require_assessment
    return CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type=request_type,
        contains_pii=False,
    )


def _build_ctx_nopii(user: User, request_type: str) -> CallContext:
    assert user.organization_id is not None
    return CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type=request_type,
        contains_pii=False,
    )


# ---------------------------------------------------------------------------
# POST /api/assessments/{assessment_id}/reviews
# ---------------------------------------------------------------------------


@router.post(
    "/api/assessments/{assessment_id}/reviews",
    response_model=DiagnosticReviewOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_diagnostic_review(
    assessment_id: UUID,
    payload: DiagnosticReviewCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> DiagnosticReviewOut:
    """Create a teacher review for one problem in an assessment.

    XOR rule: exactly one of marked_correct=True or override_pattern_id must be set.
    Validated by DiagnosticReviewCreate.validate_one_action.

    Returns 409 if an active review already exists for this (assessment, problem).
    """
    assessment = await _require_assessment(assessment_id, user, db)

    # Snapshot the auto-graded pattern for this problem (may be None).
    original_pattern_id = await _lookup_original_pattern_id(
        assessment.id, payload.problem_number, db
    )

    # Pre-check for an active review (avoids a unique-violation that would
    # invalidate the shared session in tests; also correct for production).
    existing_result = await db.execute(
        select(DiagnosticReview).where(
            DiagnosticReview.assessment_id == assessment.id,
            DiagnosticReview.problem_number == payload.problem_number,
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="an active review already exists for this problem",
        )

    review = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=payload.problem_number,
        original_pattern_id=original_pattern_id,
        override_pattern_id=payload.override_pattern_id,
        marked_correct=payload.marked_correct,
        note=payload.note,
        reviewed_by=user.id,
        reviewed_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(review)
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A review already exists for this problem",
        ) from None

    ctx = _build_ctx_nopii(user, "diagnostic_review.create")
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="diagnostic_review",
        resource_id=review.id,
        action="diagnostic_review.create",
        extra={
            "assessment_id": str(assessment.id),
            "problem_number": payload.problem_number,
        },
    )

    return await _build_review_out(review, db)


# ---------------------------------------------------------------------------
# PATCH /api/assessments/{assessment_id}/reviews/{review_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/api/assessments/{assessment_id}/reviews/{review_id}",
    response_model=DiagnosticReviewOut,
    status_code=status.HTTP_200_OK,
)
async def update_diagnostic_review(
    assessment_id: UUID,
    review_id: UUID,
    payload: DiagnosticReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> DiagnosticReviewOut:
    """Merge payload fields into an existing review and re-validate XOR rule.

    Only fields explicitly present in the request are merged (model_dump with
    exclude_unset). After merging, the XOR invariant is re-checked on the
    resulting state: exactly one of marked_correct=True or override_pattern_id
    must hold. Invalid merged state → 422.
    """
    await _require_assessment(assessment_id, user, db)

    result = await db.execute(
        select(DiagnosticReview).where(
            DiagnosticReview.id == review_id,
            DiagnosticReview.assessment_id == assessment_id,
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    review = result.scalar_one_or_none()
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="review not found",
        )

    # Merge only the fields that were explicitly supplied.
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(review, field, value)

    # Re-run XOR validation on the merged state.
    both_set = review.marked_correct and review.override_pattern_id is not None
    neither_set = not review.marked_correct and review.override_pattern_id is None
    if both_set or neither_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="must set exactly one of marked_correct=true or override_pattern_id",
        )

    await db.flush()

    ctx = _build_ctx_nopii(user, "diagnostic_review.update")
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="diagnostic_review",
        resource_id=review.id,
        action="diagnostic_review.update",
        extra={
            "assessment_id": str(assessment_id),
            "updated_fields": list(updates.keys()),
        },
    )

    return await _build_review_out(review, db)


# ---------------------------------------------------------------------------
# DELETE /api/assessments/{assessment_id}/reviews/{review_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/api/assessments/{assessment_id}/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_diagnostic_review(
    assessment_id: UUID,
    review_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Soft-delete a review by setting deleted_at to now.

    The partial unique index (deleted_at IS NULL) allows a new review to be
    created for the same problem after deletion.
    """
    await _require_assessment(assessment_id, user, db)

    result = await db.execute(
        select(DiagnosticReview).where(
            DiagnosticReview.id == review_id,
            DiagnosticReview.assessment_id == assessment_id,
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    review = result.scalar_one_or_none()
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="review not found",
        )

    review.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db.flush()

    ctx = _build_ctx_nopii(user, "diagnostic_review.delete")
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="diagnostic_review",
        resource_id=review.id,
        action="diagnostic_review.delete",
        extra={"assessment_id": str(assessment_id)},
    )
