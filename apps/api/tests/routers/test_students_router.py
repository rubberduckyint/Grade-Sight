"""Tests for the students router (POST/GET /api/students)."""

from __future__ import annotations

import pytest
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


async def _seed_student(session: AsyncSession, user: User) -> Student:
    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="Test Student",
    )
    session.add(student)
    await session.flush()
    return student


@pytest.mark.db
async def test_biography_returns_200_for_org_teacher(async_session: AsyncSession) -> None:
    """Happy path: teacher in org → 200 with the documented shape."""
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{student.id}/biography")
            assert response.status_code == 200
            body = response.json()
            assert body["student"]["id"] == str(student.id)
            assert "stats" in body
            assert "pattern_timeline" in body
            assert "recent_assessments" in body
            assert "sentence" in body
            assert body["sentence"]["eyebrow"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_biography_returns_404_for_other_org_teacher(async_session: AsyncSession) -> None:
    """Teacher in a different org cannot access this student's biography."""
    org_a = Organization(name="A")
    org_b = Organization(name="B")
    async_session.add_all([org_a, org_b])
    await async_session.flush()

    user_a = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@a.test",
        role=UserRole.teacher,
        first_name="A",
        last_name="Teach",
        organization_id=org_a.id,
    )
    async_session.add(user_a)
    await async_session.flush()

    student = Student(
        created_by_user_id=user_a.id,
        full_name="S",
        organization_id=org_a.id,
    )
    async_session.add(student)
    await async_session.flush()

    teacher_b = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@b.test",
        role=UserRole.teacher,
        first_name="B",
        last_name="Teach",
        organization_id=org_b.id,
    )
    async_session.add(teacher_b)
    await async_session.flush()

    app.dependency_overrides[get_current_user] = lambda: teacher_b
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{student.id}/biography")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_biography_returns_404_when_student_missing(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{uuid4()}/biography")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_biography_returns_404_for_parent_wrong_student(async_session: AsyncSession) -> None:
    """Parent attempting to access a student they didn't create → 404."""
    # Parent A creates a student; parent B tries to read it
    parent_a = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@a.test",
        role=UserRole.parent,
        first_name="A",
        last_name="Parent",
        organization_id=None,
    )
    parent_b = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@b.test",
        role=UserRole.parent,
        first_name="B",
        last_name="Parent",
        organization_id=None,
    )
    async_session.add_all([parent_a, parent_b])
    await async_session.flush()

    student = Student(
        full_name="Marcus",
        organization_id=None,
        created_by_user_id=parent_a.id,
    )
    async_session.add(student)
    await async_session.flush()

    app.dependency_overrides[get_current_user] = lambda: parent_b
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{student.id}/biography")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_biography_returns_401_when_unauthenticated(async_session: AsyncSession) -> None:
    """No auth dependency override → real auth runs → no token → 401."""
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{uuid4()}/biography")
            assert response.status_code in {401, 403}
    finally:
        app.dependency_overrides.clear()
