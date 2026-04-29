"""Students router — list and create students for the authenticated user's org."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.user import User
from ..schemas.students import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
)

router = APIRouter()


def _grade_str_to_int(raw: str | None) -> int | None:
    """Coerce student_profiles.grade_level (string column) to int for the API."""
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        # Defensive: legacy/non-numeric values surface as null in the API.
        return None


@router.get("/api/students", response_model=StudentListResponse)
async def list_students(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentListResponse:
    """List students for the authenticated user's org, with grade from profile."""
    stmt = (
        select(Student, StudentProfile.grade_level)
        .outerjoin(StudentProfile, StudentProfile.student_id == Student.id)
        .where(
            Student.organization_id == user.organization_id,
            Student.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    rows = (await db.execute(stmt)).all()
    return StudentListResponse(
        students=[
            StudentResponse(
                id=s.id,
                full_name=s.full_name,
                grade_level=_grade_str_to_int(g),
                created_at=s.created_at,
            )
            for s, g in rows
        ]
    )


@router.post(
    "/api/students",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student(
    payload: StudentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentResponse:
    """Create a student + matching student_profile in one transaction."""
    if not payload.full_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="full_name is required",
        )

    try:
        student = Student(
            created_by_user_id=user.id,
            organization_id=user.organization_id,
            full_name=payload.full_name.strip(),
        )
        db.add(student)
        await db.flush()  # populate student.id

        profile = StudentProfile(
            student_id=student.id,
            organization_id=user.organization_id,
            grade_level=str(payload.grade_level),
        )
        db.add(profile)
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create student",
        )

    return StudentResponse(
        id=student.id,
        full_name=student.full_name,
        grade_level=payload.grade_level,
        created_at=student.created_at,
    )
