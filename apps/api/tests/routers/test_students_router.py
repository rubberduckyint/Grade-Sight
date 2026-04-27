"""Tests for the students router (POST/GET /api/students)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_user(session: AsyncSession, *, org_id: UUID | None = None) -> User:
    if org_id is None:
        org = Organization(name="Test Org")
        session.add(org)
        await session.flush()
        org_id = org.id
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Test",
        last_name="Teacher",
        organization_id=org_id,
    )
    session.add(user)
    await session.flush()
    return user


def _override_deps(user: User, session: AsyncSession) -> None:
    """Wire FastAPI dependency overrides for the authenticated user + DB session.

    `patch` does not intercept FastAPI's Depends graph reliably, so we install
    overrides on the app for the duration of each test (cleared in teardown).
    The session override is an async generator that yields without committing —
    the test fixture owns the SAVEPOINT-backed transaction lifecycle.
    """

    async def _session_override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _session_override


async def test_create_persists_with_org_id(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.post(
                "/api/students",
                json={"full_name": "Ada Lovelace"},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201
    body = r.json()
    assert body["full_name"] == "Ada Lovelace"

    rows = (await async_session.execute(select(Student))).scalars().all()
    assert len(rows) == 1
    assert rows[0].organization_id == user.organization_id
    assert rows[0].created_by_user_id == user.id


async def test_create_rejects_empty_full_name(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.post(
                "/api/students",
                json={"full_name": ""},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 400


async def test_list_returns_only_user_org_students(async_session: AsyncSession) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)

    # Seed one student in each org
    s_a = Student(
        created_by_user_id=user_a.id,
        full_name="Student A",
        organization_id=org_a.id,
    )
    user_b = await _seed_user(async_session, org_id=org_b.id)
    s_b = Student(
        created_by_user_id=user_b.id,
        full_name="Student B",
        organization_id=org_b.id,
    )
    async_session.add(s_a)
    async_session.add(s_b)
    await async_session.flush()

    _override_deps(user_a, async_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.get(
                "/api/students",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    names = [s["full_name"] for s in body["students"]]
    assert names == ["Student A"]
