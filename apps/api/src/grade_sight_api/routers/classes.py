"""Classes router — teacher-only CRUD for classes + roster management."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.class_member import ClassMember
from ..models.klass import Klass
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.user import User, UserRole
from ..schemas.classes import ClassDetailResponse, ClassRosterMember

router = APIRouter()


def _require_teacher(user: User) -> None:
    if user.role != UserRole.teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


async def _get_class_or_404(class_id: UUID, user: User, db: AsyncSession) -> Klass:
    klass = await db.scalar(
        select(Klass).where(
            Klass.id == class_id,
            Klass.organization_id == user.organization_id,
            Klass.teacher_id == user.id,
        )
    )
    if klass is None:
        raise HTTPException(status_code=404, detail="class not found")
    return klass


async def _build_detail_response(klass: Klass, db: AsyncSession) -> ClassDetailResponse:
    roster_stmt = (
        select(ClassMember, Student.full_name, StudentProfile.grade_level)
        .join(Student, ClassMember.student_id == Student.id)
        .outerjoin(StudentProfile, StudentProfile.student_id == Student.id)
        .where(
            ClassMember.class_id == klass.id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    roster_rows = (await db.execute(roster_stmt)).all()

    return ClassDetailResponse(
        id=klass.id,
        name=klass.name,
        subject=klass.subject,
        grade_level=klass.grade_level,
        archived=klass.deleted_at is not None,
        roster=[
            ClassRosterMember(
                id=m.id,
                student_id=m.student_id,
                student_name=name,
                student_grade_level=grade,
                joined_at=m.joined_at,
            )
            for m, name, grade in roster_rows
        ],
        created_at=klass.created_at,
    )
