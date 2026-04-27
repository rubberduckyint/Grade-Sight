"""Tests for the assessments router (POST/GET /api/assessments)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
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


async def _seed_student(
    session: AsyncSession, user: User, name: str = "Test Student"
) -> Student:
    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name=name,
    )
    session.add(student)
    await session.flush()
    return student


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


async def test_create_persists_pending_row(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    _override_deps(user, async_session)

    fake_url = "https://r2.example/upload?sig=abc"
    try:
        with patch(
            "grade_sight_api.routers.assessments.storage_service.get_upload_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.post(
                    "/api/assessments",
                    json={
                        "student_id": str(student.id),
                        "original_filename": "quiz.png",
                        "content_type": "image/png",
                    },
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201
    body = r.json()
    assert body["upload_url"] == fake_url
    assert "assessment_id" in body
    assert "key" in body

    rows = (await async_session.execute(select(Assessment))).scalars().all()
    assert len(rows) == 1
    a = rows[0]
    assert a.student_id == student.id
    assert a.uploaded_by_user_id == user.id
    assert a.organization_id == user.organization_id
    assert a.status == AssessmentStatus.pending
    assert a.original_filename == "quiz.png"
    assert a.s3_url == body["key"]
    assert a.s3_url.startswith(
        f"assessments/{user.organization_id}/{student.id}/"
    )


async def test_create_rejects_cross_org_student(async_session: AsyncSession) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)
    student_b = await _seed_student(async_session, user_b)

    _override_deps(user_a, async_session)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/assessments",
                json={
                    "student_id": str(student_b.id),
                    "original_filename": "quiz.png",
                    "content_type": "image/png",
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403


async def test_create_rejects_non_image_content_type(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    _override_deps(user, async_session)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/assessments",
                json={
                    "student_id": str(student.id),
                    "original_filename": "note.txt",
                    "content_type": "text/plain",
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 400


async def test_list_filters_by_user_org(async_session: AsyncSession) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)
    student_a = await _seed_student(async_session, user_a, name="Student A")
    student_b = await _seed_student(async_session, user_b, name="Student B")

    # Seed one assessment in each org
    a_row = Assessment(
        student_id=student_a.id,
        organization_id=org_a.id,
        uploaded_by_user_id=user_a.id,
        s3_url=f"assessments/{org_a.id}/{student_a.id}/x.png",
        original_filename="a.png",
        status=AssessmentStatus.pending,
    )
    b_row = Assessment(
        student_id=student_b.id,
        organization_id=org_b.id,
        uploaded_by_user_id=user_b.id,
        s3_url=f"assessments/{org_b.id}/{student_b.id}/y.png",
        original_filename="b.png",
        status=AssessmentStatus.pending,
    )
    async_session.add(a_row)
    async_session.add(b_row)
    await async_session.flush()

    _override_deps(user_a, async_session)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.get(
                "/api/assessments",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    names = [a["original_filename"] for a in body["assessments"]]
    assert names == ["a.png"]
    assert body["assessments"][0]["student_name"] == "Student A"
