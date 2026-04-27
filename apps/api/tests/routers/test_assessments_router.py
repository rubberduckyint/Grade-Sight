"""Tests for the assessments router (multi-page).

POST /api/assessments — 5 tests covering happy path, validation, tenant scope.
GET  /api/assessments — 1 test for thumbnail + page_count shape.
GET  /api/assessments/{id} — 3 tests for detail / 404 / 403.
DELETE /api/assessments/{id} — 3 tests for soft-delete / 404 / 403.
"""

from __future__ import annotations

from contextlib import AbstractContextManager
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole
from grade_sight_api.services import storage_service


def _patch_r2_client(presigned_url: str) -> AbstractContextManager[object]:
    """Patch storage_service._get_session so the real {get,upload,download}_url
    function still runs (and writes audit_log rows) while the boto client call
    is faked. Returns a context manager.
    """
    fake_client = MagicMock()
    fake_client.generate_presigned_url = AsyncMock(return_value=presigned_url)
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(
        return_value=fake_client
    )
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)
    return patch.object(storage_service, "_get_session", return_value=fake_session)


def _override_deps(user: User, session: AsyncSession) -> None:
    """Override FastAPI dependency injection for auth + DB session.

    Spec 9 lazy-upsert tests proved app.dependency_overrides works where
    patch(...) does not (FastAPI Depends is finicky under unittest.mock.patch).
    Caller MUST call app.dependency_overrides.clear() in a finally block.
    """
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session


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


# ---- POST /api/assessments ----


async def test_create_persists_assessment_and_pages(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    _override_deps(user, async_session)

    fake_url = "https://r2.example/upload?sig=abc"
    try:
        with _patch_r2_client(fake_url):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.post(
                    "/api/assessments",
                    json={
                        "student_id": str(student.id),
                        "files": [
                            {"filename": f"page-{i}.png", "content_type": "image/png"}
                            for i in range(1, 6)
                        ],
                    },
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201
    body = r.json()
    assert "assessment_id" in body
    assert len(body["pages"]) == 5
    assert [p["page_number"] for p in body["pages"]] == [1, 2, 3, 4, 5]
    assert all(p["upload_url"] == fake_url for p in body["pages"])

    page_rows = (
        await async_session.execute(
            select(AssessmentPage).order_by(AssessmentPage.page_number)
        )
    ).scalars().all()
    assert len(page_rows) == 5
    expected_prefix = (
        f"assessments/{user.organization_id}/{student.id}/"
        f"{page_rows[0].assessment_id}/page-"
    )
    assert all(p.s3_url.startswith(expected_prefix) for p in page_rows)
    assert page_rows[0].s3_url.endswith("page-001.png")
    assert page_rows[4].s3_url.endswith("page-005.png")
    assert all(p.organization_id == user.organization_id for p in page_rows)
    assert all(p.content_type == "image/png" for p in page_rows)

    asmt_rows = (
        await async_session.execute(select(Assessment))
    ).scalars().all()
    assert len(asmt_rows) == 1
    assert asmt_rows[0].status == AssessmentStatus.pending
    assert asmt_rows[0].uploaded_by_user_id == user.id

    audit_rows = (
        await async_session.execute(
            select(AuditLog).where(AuditLog.action == "presigned_upload_issued")
        )
    ).scalars().all()
    assert len(audit_rows) == 5


async def test_create_rejects_empty_files(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/assessments",
                json={"student_id": str(student.id), "files": []},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 400


async def test_create_rejects_too_many_files(async_session: AsyncSession) -> None:
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
                    "files": [
                        {"filename": f"p{i}.png", "content_type": "image/png"}
                        for i in range(21)
                    ],
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 400


async def test_create_rejects_non_image(async_session: AsyncSession) -> None:
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
                    "files": [
                        {"filename": "ok.png", "content_type": "image/png"},
                        {"filename": "bad.txt", "content_type": "text/plain"},
                    ],
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 400


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
                    "files": [{"filename": "p.png", "content_type": "image/png"}],
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403


# ---- GET /api/assessments ----


async def test_list_returns_first_page_thumbnail_and_count(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user, name="Ada")

    asmt = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()
    for n in (1, 2):
        async_session.add(
            AssessmentPage(
                assessment_id=asmt.id,
                page_number=n,
                s3_url=f"assessments/{user.organization_id}/{student.id}/{asmt.id}/page-{n:03d}.png",
                original_filename=f"page-{n}.png",
                content_type="image/png",
                organization_id=user.organization_id,
            )
        )
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=xyz"
    try:
        with _patch_r2_client(fake_url):
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
    assert len(body["assessments"]) == 1
    item = body["assessments"][0]
    assert item["page_count"] == 2
    assert item["first_page_thumbnail_url"] == fake_url
    assert item["student_name"] == "Ada"


# ---- GET /api/assessments/{id} ----


async def test_detail_returns_pages_in_order(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user, name="Ada")

    asmt = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()
    for n in (1, 2, 3):
        async_session.add(
            AssessmentPage(
                assessment_id=asmt.id,
                page_number=n,
                s3_url=f"k/{n}.png",
                original_filename=f"page-{n}.png",
                content_type="image/png",
                organization_id=user.organization_id,
            )
        )
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=det"
    try:
        with _patch_r2_client(fake_url):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.get(
                    f"/api/assessments/{asmt.id}",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["student_name"] == "Ada"
    assert [p["page_number"] for p in body["pages"]] == [1, 2, 3]
    assert all(p["view_url"] == fake_url for p in body["pages"])
    assert body["pages"][0]["original_filename"] == "page-1.png"


async def test_detail_404_when_missing(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)

    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.get(
                f"/api/assessments/{uuid4()}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 404


async def test_detail_403_cross_org(async_session: AsyncSession) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)
    student_b = await _seed_student(async_session, user_b)

    asmt_b = Assessment(
        student_id=student_b.id,
        organization_id=org_b.id,
        uploaded_by_user_id=user_b.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt_b)
    await async_session.flush()

    _override_deps(user_a, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.get(
                f"/api/assessments/{asmt_b.id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403


# ---- DELETE /api/assessments/{id} ----


async def test_delete_soft_deletes_assessment(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    asmt = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()

    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.delete(
                f"/api/assessments/{asmt.id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 204
    await async_session.refresh(asmt)
    assert asmt.deleted_at is not None


async def test_delete_404_when_missing(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)

    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.delete(
                f"/api/assessments/{uuid4()}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 404


async def test_delete_403_cross_org(async_session: AsyncSession) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)
    student_b = await _seed_student(async_session, user_b)

    asmt_b = Assessment(
        student_id=student_b.id,
        organization_id=org_b.id,
        uploaded_by_user_id=user_b.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt_b)
    await async_session.flush()

    _override_deps(user_a, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.delete(
                f"/api/assessments/{asmt_b.id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403
