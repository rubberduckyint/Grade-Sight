"""Tests for cascade soft-delete of a user and their owned tenant data."""
from datetime import datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.subscription import Subscription
from grade_sight_api.models.user import User, UserRole
from grade_sight_api.services import account_deletion_service, stripe_service


async def _seed_parent_with_data(
    db: AsyncSession, *, org: Organization | None = None
) -> tuple[User, Student, Assessment, AnswerKey, Organization]:
    if org is None:
        org = Organization(name="Personal billing org")
        db.add(org)
        await db.flush()
    user = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"parent_{uuid4()}@test.local",
        role=UserRole.parent,
        organization_id=org.id,
    )
    db.add(user)
    await db.flush()
    student = Student(
        organization_id=org.id,
        created_by_user_id=user.id,
        full_name="Kid",
    )
    db.add(student)
    await db.flush()
    a = Assessment(
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        student_id=student.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 28),
    )
    db.add(a)
    await db.flush()
    db.add(AssessmentPage(
        assessment_id=a.id,
        organization_id=org.id,
        page_number=1,
        original_filename="p.png",
        s3_url="s3://a/p.png",
        content_type="image/png",
    ))
    key = AnswerKey(
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        name="K",
    )
    db.add(key)
    await db.commit()
    return user, student, a, key, org


@pytest.mark.asyncio
async def test_soft_delete_parent_cascades_students_assessments_keys(async_session):
    user, student, a, key, org = await _seed_parent_with_data(async_session)

    with patch.object(stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    await async_session.refresh(user)
    await async_session.refresh(student)
    await async_session.refresh(a)
    await async_session.refresh(key)
    assert user.deleted_at is not None
    assert student.deleted_at is not None
    assert a.deleted_at is not None
    assert key.deleted_at is not None


@pytest.mark.asyncio
async def test_soft_delete_cancels_stripe_subscription_at_period_end(async_session):
    user, _, _, _, org = await _seed_parent_with_data(async_session)
    sub = Subscription(
        organization_id=org.id,
        stripe_customer_id="cus_test",
        stripe_subscription_id="sub_test",
        plan="parent_monthly",
        status="active",
    )
    async_session.add(sub)
    await async_session.commit()

    mock_cancel = AsyncMock()
    with patch.object(stripe_service, "cancel_at_period_end", mock_cancel):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    mock_cancel.assert_awaited_once_with("sub_test")
    await async_session.refresh(sub)
    assert sub.deleted_at is not None


@pytest.mark.asyncio
async def test_soft_delete_skips_stripe_when_no_subscription(async_session):
    user, _, _, _, _ = await _seed_parent_with_data(async_session)

    mock_cancel = AsyncMock()
    with patch.object(stripe_service, "cancel_at_period_end", mock_cancel):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    mock_cancel.assert_not_awaited()


@pytest.mark.asyncio
async def test_soft_delete_proceeds_when_stripe_call_fails(async_session):
    user, _, _, _, org = await _seed_parent_with_data(async_session)
    sub = Subscription(
        organization_id=org.id,
        stripe_customer_id="cus_test",
        stripe_subscription_id="sub_test",
        plan="parent_monthly",
        status="active",
    )
    async_session.add(sub)
    await async_session.commit()

    failing_cancel = AsyncMock(side_effect=RuntimeError("stripe down"))
    with patch.object(stripe_service, "cancel_at_period_end", failing_cancel):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    await async_session.refresh(user)
    assert user.deleted_at is not None
    rows = (await async_session.execute(
        select(AuditLog).where(AuditLog.action == "subscription_cancel_failed")
    )).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_soft_delete_writes_audit_log_with_cascade_counts(async_session):
    user, _, _, _, _ = await _seed_parent_with_data(async_session)

    with patch.object(stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    rows = (await async_session.execute(
        select(AuditLog).where(AuditLog.action == "user_self_deleted")
    )).scalars().all()
    assert len(rows) == 1
    counts = rows[0].event_metadata["cascade_counts"]
    assert counts["students"] == 1
    assert counts["assessments"] == 1
    assert counts["answer_keys"] == 1


@pytest.mark.asyncio
async def test_soft_delete_does_not_affect_other_users_data(async_session):
    user_a, student_a, a_a, key_a, _ = await _seed_parent_with_data(async_session)
    user_b, student_b, a_b, key_b, _ = await _seed_parent_with_data(async_session)

    with patch.object(stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user_a, db=async_session)

    for row in (user_b, student_b, a_b, key_b):
        await async_session.refresh(row)
        assert row.deleted_at is None
