"""Real R2 smoke test. Runs only when INTEGRATION=1."""

from __future__ import annotations

import os
import secrets

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext

pytestmark = pytest.mark.integration


@pytest.fixture
def integration_enabled() -> None:
    if os.environ.get("INTEGRATION") != "1":
        pytest.skip("set INTEGRATION=1 to run integration tests")


async def test_r2_round_trip(
    integration_enabled: None,
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Smoke Test Org")
    async_session.add(org)
    await async_session.flush()
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="smoke_test",
        contains_pii=False,
    )

    key = f"smoke-test/{secrets.token_hex(8)}.bin"
    payload = b"grade-sight smoke test " + secrets.token_bytes(64)

    upload_url = await storage_service.get_upload_url(
        ctx=ctx, key=key, content_type="application/octet-stream", db=async_session,
    )
    async with httpx.AsyncClient() as http:
        put = await http.put(
            upload_url,
            content=payload,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert put.status_code in (200, 204), f"Upload failed: {put.status_code} {put.text}"

    download_url = await storage_service.get_download_url(
        ctx=ctx, key=key, db=async_session,
    )
    async with httpx.AsyncClient() as http:
        got = await http.get(download_url)
        assert got.status_code == 200
        assert got.content == payload

    await storage_service.delete_object(ctx=ctx, key=key, db=async_session)
