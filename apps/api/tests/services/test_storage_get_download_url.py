"""Tests for storage_service.get_download_url."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


async def test_get_download_url_returns_presigned(
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="presigned_download",
        contains_pii=False,
    )

    fake_client = MagicMock()
    fake_client.generate_presigned_url = AsyncMock(
        return_value="https://r2.test/download?sig=xyz",
    )
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(return_value=fake_client)
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage_service, "_get_session", return_value=fake_session):
        url = await storage_service.get_download_url(
            ctx=ctx,
            key="assessments/x.png",
            db=async_session,
        )

    assert url == "https://r2.test/download?sig=xyz"
    args = fake_client.generate_presigned_url.await_args
    assert args.args[0] == "get_object"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].action == "presigned_download_issued"
