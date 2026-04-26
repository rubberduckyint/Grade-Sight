"""Regression test for the stripe_service audit_log migration.

Asserts that after migration, create_customer still writes audit_log rows
with the expected metadata fields.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import stripe_service


async def test_create_customer_writes_audit_row(async_session: AsyncSession) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()

    fake_customer = MagicMock()
    fake_customer.id = "cus_TEST123"

    with patch(
        "grade_sight_api.services.stripe_service.stripe.Customer.create_async",
        new=AsyncMock(return_value=fake_customer),
    ):
        result = await stripe_service.create_customer(
            email="parent@example.com",
            organization_id=org.id,
            db=async_session,
        )

    assert result.id == "cus_TEST123"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.action == "stripe_customer_created"
    assert row.event_metadata["stripe_customer_id"] == "cus_TEST123"
    assert row.event_metadata["email"] == "parent@example.com"


async def test_create_checkout_session_writes_audit_row(
    async_session: AsyncSession,
) -> None:
    from grade_sight_api.models.subscription import Plan, Subscription, SubscriptionStatus

    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()

    sub = Subscription(
        organization_id=org.id,
        stripe_customer_id="cus_TEST123",
        stripe_subscription_id=None,
        plan=Plan.parent_monthly,
        status=SubscriptionStatus.trialing,
        trial_ends_at=None,
        current_period_end=None,
        cancel_at_period_end=False,
    )
    async_session.add(sub)
    await async_session.flush()

    fake_session = MagicMock()
    fake_session.id = "cs_TEST456"
    fake_session.url = "https://checkout.stripe.com/c/cs_TEST456"

    with patch(
        "grade_sight_api.services.stripe_service.stripe.checkout.Session.create_async",
        new=AsyncMock(return_value=fake_session),
    ):
        result = await stripe_service.create_checkout_session(
            organization_id=org.id,
            plan=Plan.parent_monthly,
            db=async_session,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
        )

    assert result.id == "cs_TEST456"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    # Two audit rows expected: stripe_customer_created from the existing sub seed?
    # No — we created the sub directly above without going through create_customer.
    # Only the checkout audit row should exist.
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.action == "stripe_checkout_session_started"
    assert row.event_metadata["session_id"] == "cs_TEST456"
    assert row.event_metadata["plan"] == "parent_monthly"
