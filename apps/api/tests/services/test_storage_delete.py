"""Tests for storage_service.delete_object."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


async def test_delete_object_calls_r2_and_audits(
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="storage_delete",
        contains_pii=True,
        audit_reason="data deletion request",
    )

    fake_client = MagicMock()
    fake_client.delete_object = AsyncMock(return_value={"DeleteMarker": True})
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(return_value=fake_client)
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage_service, "_get_session", return_value=fake_session):
        await storage_service.delete_object(
            ctx=ctx,
            key="assessments/x.png",
            db=async_session,
        )

    args = fake_client.delete_object.await_args
    assert args.kwargs["Key"] == "assessments/x.png"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].action == "storage_object_deleted"
    assert rows[0].event_metadata["audit_reason"] == "data deletion request"
