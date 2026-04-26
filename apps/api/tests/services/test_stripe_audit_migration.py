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
