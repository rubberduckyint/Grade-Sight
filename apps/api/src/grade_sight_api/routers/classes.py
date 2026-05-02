"""Classes router — teacher-only CRUD for classes + roster management."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.class_member import ClassMember
from ..models.klass import Klass
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.user import User, UserRole
from ..schemas.classes import (
    ClassCreate,
    ClassDetailResponse,
    ClassListItem,
    ClassListResponse,
    ClassRosterMember,
)

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


@router.get("/api/classes", response_model=ClassListResponse)
async def list_classes(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListResponse:
    """List the teacher's classes for their org. Active by default; pass
    include_archived=true to include soft-deleted ones."""
    _require_teacher(user)

    count_subq = (
        select(
            ClassMember.class_id.label("class_id"),
            func.count(ClassMember.id).label("student_count"),
        )
        .where(
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .group_by(ClassMember.class_id)
        .subquery()
    )

    base_filter = [
        Klass.organization_id == user.organization_id,
        Klass.teacher_id == user.id,
    ]

    stmt = (
        select(Klass, count_subq.c.student_count)
        .outerjoin(count_subq, count_subq.c.class_id == Klass.id)
        .where(*base_filter)
    )
    if not include_archived:
        stmt = stmt.where(Klass.deleted_at.is_(None))
    stmt = stmt.order_by(Klass.created_at.desc())

    rows = (await db.execute(stmt)).all()

    has_archived_count = await db.scalar(
        select(func.count(Klass.id)).where(*base_filter, Klass.deleted_at.is_not(None))
    )
    has_archived = (has_archived_count or 0) > 0

    return ClassListResponse(
        classes=[
            ClassListItem(
                id=k.id,
                name=k.name,
                subject=k.subject,
                grade_level=k.grade_level,
                archived=k.deleted_at is not None,
                student_count=int(count or 0),
                created_at=k.created_at,
            )
            for k, count in rows
        ],
        has_archived=has_archived,
    )


@router.post(
    "/api/classes",
    response_model=ClassListItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_class(
    payload: ClassCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListItem:
    _require_teacher(user)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    new_class = Klass(
        organization_id=user.organization_id,
        teacher_id=user.id,
        name=name,
        subject=payload.subject,
        grade_level=payload.grade_level,
    )
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)

    return ClassListItem(
        id=new_class.id,
        name=new_class.name,
        subject=new_class.subject,
        grade_level=new_class.grade_level,
        archived=False,
        student_count=0,
        created_at=new_class.created_at,
    )
