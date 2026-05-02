"""Tests for /api/me endpoints (existing GET + new POST /api/me/delete)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_user(
    async_session: AsyncSession, role: UserRole = UserRole.parent
) -> tuple[User, Organization]:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    user = User(
        clerk_id=f"clerk_{uuid4().hex}",
        email=f"u_{uuid4().hex[:8]}@test.local",
        role=role,
        organization_id=org.id,
    )
    async_session.add(user)
    await async_session.flush()
    return user, org


def _override_deps(async_session: AsyncSession, user: User) -> None:
    """Wire FastAPI dependency overrides for authenticated user + DB session."""

    async def _session_override() -> AsyncIterator[AsyncSession]:
        yield async_session

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _session_override


@pytest.mark.asyncio
async def test_delete_self_returns_204(async_session: AsyncSession) -> None:
    user, _ = await _seed_user(async_session)
    student = Student(
        organization_id=user.organization_id,
        created_by_user_id=user.id,
        full_name="Kid",
    )
    async_session.add(student)
    await async_session.flush()

    _override_deps(async_session, user)
    try:
        with patch(
            "grade_sight_api.services.account_deletion_service.stripe_service.cancel_at_period_end",
            AsyncMock(),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/api/me/delete")
        assert resp.status_code == 204
        await async_session.refresh(user)
        assert user.deleted_at is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_self_unauthenticated_returns_401(
    async_session: AsyncSession,
) -> None:
    # Ensure no dependency overrides are set — get_current_user runs the real
    # auth path, which expects a Clerk token and raises 401 when absent.
    app.dependency_overrides.clear()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/api/me/delete")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_delete_self_multi_teacher_org_returns_409(
    async_session: AsyncSession,
) -> None:
    teacher_a, org = await _seed_user(async_session, role=UserRole.teacher)
    teacher_b = User(
        clerk_id=f"clerk_{uuid4().hex}",
        email=f"b_{uuid4().hex[:8]}@test.local",
        role=UserRole.teacher,
        organization_id=org.id,
    )
    async_session.add(teacher_b)
    await async_session.flush()

    _override_deps(async_session, teacher_a)
    try:
        with patch(
            "grade_sight_api.services.account_deletion_service.stripe_service.cancel_at_period_end",
            AsyncMock(),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/api/me/delete")
        assert resp.status_code == 409
    finally:
        app.dependency_overrides.clear()
