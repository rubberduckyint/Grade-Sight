"""Tests for the shared _logging helpers."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services._logging import write_audit_log, write_llm_call_log
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


async def test_write_llm_call_log_success(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )
    await write_llm_call_log(
        async_session,
        ctx=ctx,
        model="claude-haiku-4-5-20251001",
        tokens_input=10,
        tokens_output=5,
        cost_usd=Decimal("0.000123"),
        latency_ms=420,
        success=True,
    )
    await async_session.flush()

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.user_id is None
    assert row.model == "claude-haiku-4-5-20251001"
    assert row.tokens_input == 10
    assert row.tokens_output == 5
    assert row.cost_usd == Decimal("0.000123")
    assert row.latency_ms == 420
    assert row.request_type == "test_text"
    assert row.success is True
    assert row.error_message is None


async def test_write_llm_call_log_failure(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )
    await write_llm_call_log(
        async_session,
        ctx=ctx,
        model="claude-haiku-4-5-20251001",
        tokens_input=0,
        tokens_output=0,
        cost_usd=Decimal("0"),
        latency_ms=12000,
        success=False,
        error_message="anthropic.APITimeoutError: Request timed out.",
    )
    await async_session.flush()

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is False
    assert rows[0].error_message == "anthropic.APITimeoutError: Request timed out."
