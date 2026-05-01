"""Tests for the answer_keys router (POST/GET list/GET detail/DELETE).

Mirror of test_assessments_router.py. 12 tests across the 4 endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.answer_key_page import AnswerKeyPage
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


def _override_deps(user: User, session: AsyncSession) -> None:
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


# ---- POST /api/answer-keys (5 tests) ----


async def test_create_persists_answer_key_and_pages(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    fake_url = "https://r2.example/upload?sig=abc"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_upload_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.post(
                    "/api/answer-keys",
                    json={
                        "name": "Algebra Quiz 1 Key",
                        "files": [
                            {"filename": f"page-{i}.png", "content_type": "image/png"}
                            for i in range(1, 4)
                        ],
                    },
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201
    body = r.json()
    assert "answer_key_id" in body
    assert len(body["pages"]) == 3
    assert [p["page_number"] for p in body["pages"]] == [1, 2, 3]

    page_rows = (
        await async_session.execute(
            select(AnswerKeyPage).order_by(AnswerKeyPage.page_number)
        )
    ).scalars().all()
    assert len(page_rows) == 3
    expected_prefix = f"answer-keys/{user.organization_id}/{page_rows[0].answer_key_id}/page-"
    assert all(p.s3_url.startswith(expected_prefix) for p in page_rows)
    assert page_rows[0].s3_url.endswith("page-001.png")

    key_rows = (
        await async_session.execute(select(AnswerKey))
    ).scalars().all()
    assert len(key_rows) == 1
    assert key_rows[0].name == "Algebra Quiz 1 Key"
    assert key_rows[0].uploaded_by_user_id == user.id


async def test_create_rejects_empty_files(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/answer-keys",
                json={"name": "Test", "files": []},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 400


async def test_create_rejects_too_many_files(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/answer-keys",
                json={
                    "name": "Test",
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
    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/answer-keys",
                json={
                    "name": "Test",
                    "files": [{"filename": "p.txt", "content_type": "text/plain"}],
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 400


async def test_create_rejects_empty_name(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                "/api/answer-keys",
                json={
                    "name": "  ",
                    "files": [{"filename": "p.png", "content_type": "image/png"}],
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 400


# ---- GET /api/answer-keys (1 test) ----


async def test_list_returns_keys_for_org_with_thumbnails(
    async_session: AsyncSession,
) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)

    key_a = AnswerKey(
        uploaded_by_user_id=user_a.id,
        organization_id=org_a.id,
        name="Org A Key",
    )
    key_b = AnswerKey(
        uploaded_by_user_id=user_b.id,
        organization_id=org_b.id,
        name="Org B Key",
    )
    async_session.add(key_a)
    async_session.add(key_b)
    await async_session.flush()

    for n in (1, 2):
        async_session.add(
            AnswerKeyPage(
                answer_key_id=key_a.id,
                organization_id=org_a.id,
                page_number=n,
                s3_url=f"answer-keys/{org_a.id}/{key_a.id}/page-{n:03d}.png",
                original_filename=f"page-{n}.png",
                content_type="image/png",
            )
        )
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key_b.id,
            organization_id=org_b.id,
            page_number=1,
            s3_url=f"answer-keys/{org_b.id}/{key_b.id}/page-001.png",
            original_filename="page-1.png",
            content_type="image/png",
        )
    )
    await async_session.flush()

    _override_deps(user_a, async_session)
    fake_url = "https://r2.example/get?sig=xyz"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.get(
                    "/api/answer-keys",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    keys = body["answer_keys"]
    assert len(keys) == 1  # only Org A's key
    assert keys[0]["name"] == "Org A Key"
    assert keys[0]["page_count"] == 2
    assert keys[0]["first_page_thumbnail_url"] == fake_url


# ---- GET /api/answer-keys/{id} (3 tests) ----


async def test_detail_returns_pages_in_order(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()
    for n in (1, 2, 3):
        async_session.add(
            AnswerKeyPage(
                answer_key_id=key.id,
                organization_id=user.organization_id,
                page_number=n,
                s3_url=f"k/{n}.png",
                original_filename=f"page-{n}.png",
                content_type="image/png",
            )
        )
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=det"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.get(
                    f"/api/answer-keys/{key.id}",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert [p["page_number"] for p in body["pages"]] == [1, 2, 3]
    assert all(p["view_url"] == fake_url for p in body["pages"])


async def test_detail_404_when_missing(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.get(
                f"/api/answer-keys/{uuid4()}",
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
    key_b = AnswerKey(
        uploaded_by_user_id=user_b.id,
        organization_id=org_b.id,
        name="Org B Key",
    )
    async_session.add(key_b)
    await async_session.flush()

    _override_deps(user_a, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.get(
                f"/api/answer-keys/{key_b.id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 403


# ---- DELETE /api/answer-keys/{id} (3 tests) ----


async def test_delete_soft_deletes_key(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()

    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.delete(
                f"/api/answer-keys/{key.id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 204
    await async_session.refresh(key)
    assert key.deleted_at is not None


async def test_delete_404_when_missing(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.delete(
                f"/api/answer-keys/{uuid4()}",
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
    key_b = AnswerKey(
        uploaded_by_user_id=user_b.id,
        organization_id=org_b.id,
        name="Org B Key",
    )
    async_session.add(key_b)
    await async_session.flush()

    _override_deps(user_a, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.delete(
                f"/api/answer-keys/{key_b.id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 403


# ---- GET /api/answer-keys usage field (3 tests) ----


async def test_list_answer_keys_returns_zero_usage_for_unused_key(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Unused Key",
    )
    async_session.add(key)
    await async_session.flush()
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key.id,
            organization_id=user.organization_id,
            page_number=1,
            original_filename="p1.png",
            s3_url="s3://k/p1.png",
            content_type="image/png",
        )
    )
    await async_session.commit()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=u0"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                resp = await client.get(
                    "/api/answer-keys",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    keys = resp.json()["answer_keys"]
    assert len(keys) == 1
    assert keys[0]["usage"] == {"used_count": 0, "last_used_at": None}


async def test_list_answer_keys_returns_correct_usage_count_and_last_used(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Used Key",
    )
    student = Student(
        organization_id=user.organization_id,
        created_by_user_id=user.id,
        full_name="Test Student",
    )
    async_session.add_all([key, student])
    await async_session.flush()
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key.id,
            organization_id=user.organization_id,
            page_number=1,
            original_filename="p1.png",
            s3_url="s3://k/p1.png",
            content_type="image/png",
        )
    )

    earlier = datetime(2026, 4, 20, tzinfo=timezone.utc)
    later = datetime(2026, 4, 28, tzinfo=timezone.utc)
    assessments = []
    for ts in (earlier, later):
        a = Assessment(
            organization_id=user.organization_id,
            uploaded_by_user_id=user.id,
            student_id=student.id,
            answer_key_id=key.id,
            status=AssessmentStatus.completed,
            uploaded_at=ts.replace(tzinfo=None),
        )
        async_session.add(a)
        assessments.append(a)
    await async_session.flush()
    for a in assessments:
        async_session.add(
            AssessmentPage(
                assessment_id=a.id,
                organization_id=user.organization_id,
                page_number=1,
                original_filename="p.png",
                s3_url="s3://a/p.png",
                content_type="image/png",
            )
        )
    await async_session.commit()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=u1"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                resp = await client.get(
                    "/api/answer-keys",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    keys = resp.json()["answer_keys"]
    assert keys[0]["usage"]["used_count"] == 2
    assert keys[0]["usage"]["last_used_at"].startswith("2026-04-28")


async def test_list_answer_keys_excludes_soft_deleted_assessments_from_usage(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Key",
    )
    student = Student(
        organization_id=user.organization_id,
        created_by_user_id=user.id,
        full_name="Test Student",
    )
    async_session.add_all([key, student])
    await async_session.flush()
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key.id,
            organization_id=user.organization_id,
            page_number=1,
            original_filename="p1.png",
            s3_url="s3://k/p1.png",
            content_type="image/png",
        )
    )

    a_alive = Assessment(
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        student_id=student.id,
        answer_key_id=key.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 20),
    )
    a_deleted = Assessment(
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        student_id=student.id,
        answer_key_id=key.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 22),
        deleted_at=datetime(2026, 4, 23),
    )
    async_session.add_all([a_alive, a_deleted])
    await async_session.flush()
    async_session.add(
        AssessmentPage(
            assessment_id=a_alive.id,
            organization_id=user.organization_id,
            page_number=1,
            original_filename="p.png",
            s3_url="s3://a/p.png",
            content_type="image/png",
        )
    )
    async_session.add(
        AssessmentPage(
            assessment_id=a_deleted.id,
            organization_id=user.organization_id,
            page_number=1,
            original_filename="p.png",
            s3_url="s3://a/p2.png",
            content_type="image/png",
        )
    )
    await async_session.commit()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=u2"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                resp = await client.get(
                    "/api/answer-keys",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    keys = resp.json()["answer_keys"]
    assert keys[0]["usage"]["used_count"] == 1
    assert keys[0]["usage"]["last_used_at"].startswith("2026-04-20")


async def test_list_answer_keys_does_not_count_other_org_assessments(
    async_session: AsyncSession,
) -> None:
    # Seed two orgs, each with their own key and student.
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)

    key_a = AnswerKey(
        uploaded_by_user_id=user_a.id,
        organization_id=org_a.id,
        name="Org A Key",
    )
    key_b = AnswerKey(
        uploaded_by_user_id=user_b.id,
        organization_id=org_b.id,
        name="Org B Key",
    )
    student_a = Student(
        organization_id=org_a.id,
        created_by_user_id=user_a.id,
        full_name="Student A",
    )
    student_b = Student(
        organization_id=org_b.id,
        created_by_user_id=user_b.id,
        full_name="Student B",
    )
    async_session.add_all([key_a, key_b, student_a, student_b])
    await async_session.flush()

    # Org A needs a page so the thumbnail lookup works.
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key_a.id,
            organization_id=org_a.id,
            page_number=1,
            original_filename="p1.png",
            s3_url="s3://org-a/key-a/p1.png",
            content_type="image/png",
        )
    )

    # Seed 2 assessments for Org A referencing key_a.
    for i in range(2):
        a = Assessment(
            organization_id=org_a.id,
            uploaded_by_user_id=user_a.id,
            student_id=student_a.id,
            answer_key_id=key_a.id,
            status=AssessmentStatus.completed,
            uploaded_at=datetime(2026, 4, 20 + i),
        )
        async_session.add(a)

    # Seed 1 assessment for Org B referencing key_b.
    a_b = Assessment(
        organization_id=org_b.id,
        uploaded_by_user_id=user_b.id,
        student_id=student_b.id,
        answer_key_id=key_b.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 25),
    )
    async_session.add(a_b)
    await async_session.commit()

    # Request as Org A's teacher.
    _override_deps(user_a, async_session)
    fake_url = "https://r2.example/get?sig=iso"
    try:
        with patch(
            "grade_sight_api.routers.answer_keys.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                resp = await client.get(
                    "/api/answer-keys",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    keys = resp.json()["answer_keys"]
    # Org B's key must not appear in the response.
    assert len(keys) == 1
    assert keys[0]["name"] == "Org A Key"
    # Org B's 1 assessment must NOT be counted; only Org A's 2 assessments count.
    assert keys[0]["usage"]["used_count"] == 2
