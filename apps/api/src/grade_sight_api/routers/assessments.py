"""Assessments router — list and create assessments for the authenticated user's org.

POST /api/assessments creates the assessment row in `pending` status AND returns
a presigned R2 PUT URL the browser uses to upload the file directly. Single
endpoint by design (see spec).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.assessment import Assessment, AssessmentStatus
from ..models.student import Student
from ..models.user import User
from ..schemas.assessments import (
    AssessmentCreateRequest,
    AssessmentCreateResponse,
    AssessmentListItem,
    AssessmentListResponse,
)
from ..services import storage_service
from ..services.call_context import CallContext

router = APIRouter()


def _safe_extension(filename: str) -> str:
    """Lowercase file extension without the dot, defaulting to 'bin'."""
    suffix = Path(filename).suffix.lstrip(".").lower()
    return suffix or "bin"


@router.get("/api/assessments", response_model=AssessmentListResponse)
async def list_assessments(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentListResponse:
    """List recent assessments for the user's org, joined with student name."""
    if user.organization_id is None:
        return AssessmentListResponse(assessments=[])

    result = await db.execute(
        select(Assessment, Student.full_name)
        .join(Student, Assessment.student_id == Student.id)
        .where(
            Assessment.organization_id == user.organization_id,
            Assessment.deleted_at.is_(None),
        )
        .order_by(Assessment.uploaded_at.desc())
        .limit(limit)
    )
    items: list[AssessmentListItem] = []
    for assessment, student_name in result.all():
        items.append(
            AssessmentListItem(
                id=assessment.id,
                student_id=assessment.student_id,
                student_name=student_name,
                original_filename=assessment.original_filename,
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
    """Create a pending assessment row and return a presigned R2 PUT URL."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no organization",
        )
    if not payload.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="content_type must be an image/* type",
        )
    filename = payload.original_filename.strip()
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="original_filename is required",
        )

    # Look up the student and verify it belongs to the user's org
    result = await db.execute(
        select(Student).where(
            Student.id == payload.student_id,
            Student.deleted_at.is_(None),
        )
    )
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="student not found"
        )
    if student.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="student does not belong to your organization",
        )

    # Insert the assessment row with a generated R2 key
    assessment = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        s3_url="",  # filled in below once we know the assessment_id
        original_filename=filename,
        status=AssessmentStatus.pending,
    )
    db.add(assessment)
    await db.flush()

    ext = _safe_extension(filename)
    key = f"assessments/{user.organization_id}/{student.id}/{assessment.id}.{ext}"
    assessment.s3_url = key
    await db.flush()

    # Generate the presigned URL via the service layer (writes audit_log)
    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="assessment_upload_url",
        contains_pii=True,
        audit_reason="upload student assessment image",
    )
    upload_url = await storage_service.get_upload_url(
        ctx=ctx,
        key=key,
        content_type=payload.content_type,
        db=db,
    )

    return AssessmentCreateResponse(
        assessment_id=assessment.id,
        upload_url=upload_url,
        key=key,
    )
