"""Tests for storage_service.get_upload_url."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


async def test_get_upload_url_returns_presigned(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="presigned_upload",
        contains_pii=False,
    )

    fake_client = MagicMock()
    fake_client.generate_presigned_url = AsyncMock(
        return_value="https://r2.test/upload?sig=abc",
    )
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(return_value=fake_client)
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage_service, "_get_session", return_value=fake_session):
        url = await storage_service.get_upload_url(
            ctx=ctx,
            key="assessments/test-key.png",
            content_type="image/png",
            db=async_session,
        )

    assert url == "https://r2.test/upload?sig=abc"

    args = fake_client.generate_presigned_url.await_args
    assert args.args[0] == "put_object"
    params = args.kwargs["Params"]
    assert params["Key"] == "assessments/test-key.png"
    assert params["ContentType"] == "image/png"
    assert args.kwargs["ExpiresIn"] == 600

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].action == "presigned_upload_issued"
    assert rows[0].event_metadata["key"] == "assessments/test-key.png"
