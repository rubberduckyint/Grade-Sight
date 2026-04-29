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


async def test_create_persists_student_and_profile_with_grade(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park", "grade_level": 8},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Marcus Park"
    assert body["grade_level"] == 8

    # Both rows exist and are linked.
    student = (
        await async_session.execute(
            select(Student).where(Student.full_name == "Marcus Park")
        )
    ).scalar_one()
    assert student.organization_id == user.organization_id
    assert student.created_by_user_id == user.id
    from grade_sight_api.models.student_profile import StudentProfile

    profile = (
        await async_session.execute(
            select(StudentProfile).where(StudentProfile.student_id == student.id)
        )
    ).scalar_one()
    assert profile.grade_level == "8"
    assert profile.organization_id == user.organization_id


async def test_create_rejects_empty_full_name(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "   ", "grade_level": 8},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 400


async def test_create_rejects_missing_grade(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_create_rejects_grade_below_range(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park", "grade_level": 4},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_create_rejects_grade_above_range(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park", "grade_level": 13},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_create_rolls_back_student_on_profile_failure(
    async_session: AsyncSession,
) -> None:
    """If the StudentProfile insert fails, the Student row must not persist."""
    from unittest.mock import patch

    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    # Patch the StudentProfile constructor in the router module so the second
    # insert raises. The first insert (Student) has already flushed, so this
    # exercises the transaction-rollback path.
    with patch(
        "grade_sight_api.routers.students.StudentProfile",
        side_effect=Exception("simulated profile failure"),
    ):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/students",
                json={"full_name": "Rollback Test", "grade_level": 7},
            )
    app.dependency_overrides.clear()

    assert response.status_code == 500
    # The Student row from the first insert must not persist.
    rows = (
        await async_session.execute(
            select(Student).where(Student.full_name == "Rollback Test")
        )
    ).scalars().all()
    assert rows == []


async def test_list_includes_grade_via_profile_join(
    async_session: AsyncSession,
) -> None:
    """list_students LEFT-JOINs student_profiles and surfaces grade_level."""
    from grade_sight_api.models.student_profile import StudentProfile

    user = await _seed_user(async_session)

    # Seed two students: one with a profile, one without (legacy row).
    student_a = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="With Profile",
    )
    student_b = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="Legacy Row",
    )
    async_session.add_all([student_a, student_b])
    await async_session.flush()
    async_session.add(
        StudentProfile(
            student_id=student_a.id,
            organization_id=user.organization_id,
            grade_level="9",
        )
    )
    await async_session.flush()

    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/students")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    by_name = {s["full_name"]: s for s in body["students"]}
    assert by_name["With Profile"]["grade_level"] == 9
    assert by_name["Legacy Row"]["grade_level"] is None


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
