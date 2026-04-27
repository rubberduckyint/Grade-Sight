"""Students router — list and create students for the authenticated user's org."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.student import Student
from ..models.user import User
from ..schemas.students import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
)

router = APIRouter()


@router.get("/api/students", response_model=StudentListResponse)
async def list_students(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentListResponse:
    """List students belonging to the authenticated user's organization."""
    result = await db.execute(
        select(Student)
        .where(
            Student.organization_id == user.organization_id,
            Student.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    students = result.scalars().all()
    return StudentListResponse(
        students=[StudentResponse.model_validate(s) for s in students]
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
    """Create a student under the authenticated user's organization."""
    if not payload.full_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="full_name is required",
        )

    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name=payload.full_name.strip(),
        date_of_birth=payload.date_of_birth,
    )
    db.add(student)
    await db.flush()
    return StudentResponse.model_validate(student)
