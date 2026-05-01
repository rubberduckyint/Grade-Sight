"""Students router — list and create students for the authenticated user's org."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.user import User, UserRole
from ..schemas.biography import StudentBiographyResponse
from ..schemas.students import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
)
from ..services import biography_service

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

    return StudentResponse(
        id=student.id,
        full_name=student.full_name,
        grade_level=payload.grade_level,
        created_at=student.created_at,
    )


@router.get(
    "/api/students/{student_id}/biography",
    response_model=StudentBiographyResponse,
)
async def get_student_biography(
    student_id: UUID,
    weeks: int = 6,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentBiographyResponse:
    """Return the longitudinal biography view for a student."""
    if weeks < 1 or weeks > 26:
        raise HTTPException(status_code=400, detail="weeks must be 1..26")

    student = await db.scalar(
        select(Student).where(Student.id == student_id, Student.deleted_at.is_(None))
    )
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")

    if user.role == UserRole.parent:
        if student.created_by_user_id != user.id:
            raise HTTPException(status_code=404, detail="student not found")
        role: Literal["parent", "teacher"] = "parent"
    else:
        if student.organization_id is None or student.organization_id != user.organization_id:
            raise HTTPException(status_code=404, detail="student not found")
        role = "teacher"

    biography = await biography_service.build_biography(
        student_id=student_id, role=role, db=db, window_weeks=weeks
    )
    if biography is None:
        raise HTTPException(status_code=404, detail="student not found")
    return biography
