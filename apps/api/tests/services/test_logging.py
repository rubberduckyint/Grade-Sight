"""Tests for the shared _logging helpers."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services._logging import write_audit_log
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


async def test_write_audit_log_inserts_row(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_action",
        contains_pii=True,
        audit_reason="unit test",
    )
    await write_audit_log(
        async_session,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="test_audit_action",
        extra={"foo": "bar"},
    )
    await async_session.flush()

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.user_id is None
    assert row.resource_type == "subscription"
    assert row.action == "test_audit_action"
    assert row.event_metadata["foo"] == "bar"
    assert row.event_metadata["request_type"] == "test_action"
    assert row.event_metadata["audit_reason"] == "unit test"


async def test_write_audit_log_rejects_empty_action(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="t",
        contains_pii=False,
    )
    with pytest.raises(ValueError, match="action is required"):
        await write_audit_log(
            async_session,
            ctx=ctx,
            resource_type="subscription",
            resource_id=None,
            action="",
        )


async def test_write_audit_log_no_extra(async_session: AsyncSession) -> None:
    """Calling without extra still produces a valid row with request_type recorded."""
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="t",
        contains_pii=False,
    )
    await write_audit_log(
        async_session,
        ctx=ctx,
        resource_type="organization",
        resource_id=org.id,
        action="created",
    )
    await async_session.flush()

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].event_metadata == {"request_type": "t"}
