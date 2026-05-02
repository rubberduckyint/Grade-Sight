"""Cascade soft-delete a user and their owned tenant data.

Hard purge of the underlying rows + S3 files happens via a 30-day cron
that's deferred to a followup. This service ONLY sets deleted_at columns
and cancels Stripe subscriptions at period end.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
from ..models.assessment import Assessment
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.assessment_page import AssessmentPage
from ..models.audit_log import AuditLog
from ..models.class_member import ClassMember
from ..models.diagnostic_review import DiagnosticReview
from ..models.klass import Klass
from ..models.organization import Organization
from ..models.problem_observation import ProblemObservation
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.subscription import Subscription
from ..models.user import User, UserRole
from . import stripe_service


class MultiTeacherOrgError(Exception):
    """Raised when a teacher tries to delete in an org with other teachers — not v1 behavior."""


async def soft_delete_user(*, user: User, db: AsyncSession) -> None:
    """Soft-delete the user and cascade to their owned tenant data.

    All work happens in a single transaction; the caller's session is
    committed before this function returns.
    """
    # Use naive UTC datetime — columns are TIMESTAMP WITHOUT TIME ZONE.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cascade_counts: dict[str, int] = {}

    await _cancel_stripe_subscription(user=user, db=db)

    # Multi-teacher guard — must run BEFORE any cascade so a guard-trip
    # leaves the DB untouched.
    if user.role == UserRole.teacher and user.organization_id is not None:
        result = await db.execute(
            select(User).where(
                User.organization_id == user.organization_id,
                User.id != user.id,
                User.deleted_at.is_(None),
                User.role == UserRole.teacher,
            ).limit(1)
        )
        if result.scalar_one_or_none() is not None:
            raise MultiTeacherOrgError(
                "Cannot delete a teacher account in a multi-teacher org (v1)."
            )

    if user.role == UserRole.teacher and user.organization_id is not None:
        await _cascade_teacher(user=user, db=db, now=now, counts=cascade_counts)
    else:
        await _cascade_parent(user=user, db=db, now=now, counts=cascade_counts)

    # Soft-delete the user row itself
    await db.execute(
        update(User).where(User.id == user.id).values(deleted_at=now)
    )

    # Audit log
    db.add(AuditLog(
        organization_id=user.organization_id,
        user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        action="user_self_deleted",
        event_metadata={"cascade_counts": cascade_counts},
    ))

    await db.commit()


async def _cancel_stripe_subscription(*, user: User, db: AsyncSession) -> None:
    if user.organization_id is None:
        return
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == user.organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription is None or not subscription.stripe_subscription_id:
        return
    try:
        await stripe_service.cancel_at_period_end(subscription.stripe_subscription_id)
    except Exception as exc:  # noqa: BLE001
        db.add(AuditLog(
            organization_id=user.organization_id,
            user_id=user.id,
            resource_type="subscription",
            resource_id=subscription.id,
            action="subscription_cancel_failed",
            event_metadata={
                "stripe_subscription_id": subscription.stripe_subscription_id,
                "error": str(exc),
            },
        ))
    # Soft-delete the local subscription row regardless
    await db.execute(
        update(Subscription)
        .where(Subscription.id == subscription.id)
        .values(deleted_at=datetime.now(timezone.utc).replace(tzinfo=None))
    )


async def _cascade_parent(
    *, user: User, db: AsyncSession, now: datetime, counts: dict[str, int]
) -> None:
    """Soft-delete rows owned by the parent (scoped by user FK).

    Student uses created_by_user_id; Assessment and AnswerKey use
    uploaded_by_user_id. Children of those rows (e.g. AssessmentPage) are
    then cascade-soft-deleted by joining back through the parent table's id.
    """
    # Student uses created_by_user_id
    result = await db.execute(
        update(Student)
        .where(Student.created_by_user_id == user.id, Student.deleted_at.is_(None))
        .values(deleted_at=now)
        .returning(Student.id)
    )
    counts[Student.__tablename__] = len(result.all())

    # Assessment and AnswerKey use uploaded_by_user_id
    for model in (Assessment, AnswerKey):
        m: Any = model
        result = await db.execute(
            update(model)
            .where(m.uploaded_by_user_id == user.id, m.deleted_at.is_(None))
            .values(deleted_at=now)
            .returning(m.id)
        )
        counts[model.__tablename__] = len(result.all())

    await _cascade_children(db=db, now=now, counts=counts)


async def _cascade_teacher(
    *, user: User, db: AsyncSession, now: datetime, counts: dict[str, int]
) -> None:
    """Soft-delete rows in the teacher's org (single-teacher org assumption)."""
    org_id = user.organization_id
    assert org_id is not None  # narrowed by caller

    for model in (Student, Assessment, AnswerKey, Klass):
        m: Any = model
        result = await db.execute(
            update(model)
            .where(m.organization_id == org_id, m.deleted_at.is_(None))
            .values(deleted_at=now)
            .returning(m.id)
        )
        counts[model.__tablename__] = len(result.all())

    await _cascade_children(db=db, now=now, counts=counts)

    # Org row
    await db.execute(
        update(Organization)
        .where(Organization.id == org_id, Organization.deleted_at.is_(None))
        .values(deleted_at=now)
    )


async def _cascade_children(
    *, db: AsyncSession, now: datetime, counts: dict[str, int]
) -> None:
    """Soft-delete child rows whose parents were just soft-deleted in this txn.

    Each child table is updated to deleted_at=now where its FK points at a
    parent row whose deleted_at == now (i.e., the parent we just nuked in
    this same transaction). This avoids loading parent ids into Python.
    """
    child_specs: list[tuple[Any, Any, str]] = [
        (StudentProfile, Student, "student_id"),
        (AssessmentPage, Assessment, "assessment_id"),
        (AssessmentDiagnosis, Assessment, "assessment_id"),
        (DiagnosticReview, Assessment, "assessment_id"),
        (ProblemObservation, AssessmentDiagnosis, "diagnosis_id"),
        (AnswerKeyPage, AnswerKey, "answer_key_id"),
        (ClassMember, Klass, "class_id"),
    ]
    for child_model, parent_model, fk_attr in child_specs:
        await db.execute(
            update(child_model)
            .where(
                getattr(child_model, fk_attr).in_(
                    select(parent_model.id).where(parent_model.deleted_at == now)
                ),
                child_model.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )
