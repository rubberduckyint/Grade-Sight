"""Tests for the assessments router (multi-page).

POST /api/assessments — 5 tests covering happy path, validation, tenant scope.
GET  /api/assessments — 1 test for thumbnail + page_count shape.
GET  /api/assessments/{id} — 3 tests for detail / 404 / 403.
DELETE /api/assessments/{id} — 3 tests for soft-delete / 404 / 403.
"""

from __future__ import annotations

import json
from contextlib import AbstractContextManager
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.problem_observation import ProblemObservation
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


# ---- POST /api/assessments/{id}/diagnose ----


async def test_post_diagnose_endpoint(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
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
    async_session.add(
        AssessmentPage(
            assessment_id=asmt.id,
            page_number=1,
            s3_url=f"k/{asmt.id}/page-001.png",
            original_filename="p1.png",
            content_type="image/png",
            organization_id=user.organization_id,
        )
    )
    await async_session.flush()

    pattern = seed_minimal_taxonomy["pattern"]
    fake_text = json.dumps(
        {
            "overall_summary": "1 of 1 wrong.",
            "problems": [
                {
                    "problem_number": 1,
                    "page_number": 1,
                    "student_answer": "x = 5",
                    "correct_answer": "x = 7",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "sign error",
                    "solution_steps": "step 1\nstep 2",
                }
            ],
        }
    )
    from grade_sight_api.services.claude_service import ClaudeVisionResponse
    fake_response = ClaudeVisionResponse(
        text=fake_text, tokens_input=10, tokens_output=5,
        model="claude-sonnet-4-6",
    )

    _override_deps(user, async_session)
    try:
        with patch(
            "grade_sight_api.services.engine_service.claude_service.call_vision_multi",
            new=AsyncMock(return_value=fake_response),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.post(
                    f"/api/assessments/{asmt.id}/diagnose",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "claude-sonnet-4-6"
    assert body["overall_summary"] == "1 of 1 wrong."
    assert len(body["problems"]) == 1
    p = body["problems"][0]
    assert p["is_correct"] is False
    assert p["error_pattern_slug"] == pattern.slug
    assert p["error_pattern_name"] == pattern.name
    assert p["error_category_slug"] == "execution"


# ---- GET /api/assessments/{id} with diagnosis ----


async def test_detail_includes_diagnosis_when_completed(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    from decimal import Decimal

    from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
    from grade_sight_api.models.problem_observation import ProblemObservation

    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user, name="Ada")
    asmt = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.completed,
    )
    async_session.add(asmt)
    await async_session.flush()
    async_session.add(
        AssessmentPage(
            assessment_id=asmt.id,
            page_number=1,
            s3_url=f"k/{asmt.id}/page-001.png",
            original_filename="p1.png",
            content_type="image/png",
            organization_id=user.organization_id,
        )
    )
    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=user.organization_id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=100,
        tokens_output=20,
        cost_usd=Decimal("0.0123"),
        latency_ms=12345,
        overall_summary="Test summary.",
    )
    async_session.add(diag)
    await async_session.flush()
    pattern = seed_minimal_taxonomy["pattern"]
    async_session.add(
        ProblemObservation(
            diagnosis_id=diag.id,
            organization_id=user.organization_id,
            problem_number=1,
            page_number=1,
            student_answer="x = 5",
            correct_answer="x = 7",
            is_correct=False,
            error_pattern_id=pattern.id,
            error_description="sign error",
            solution_steps="steps",
        )
    )
    await async_session.flush()

    _override_deps(user, async_session)
    fake_get_url = "https://r2.example/get?sig=abc"
    try:
        with patch(
            "grade_sight_api.routers.assessments.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_get_url),
        ):
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
    assert body["diagnosis"] is not None
    assert body["diagnosis"]["overall_summary"] == "Test summary."
    assert len(body["diagnosis"]["problems"]) == 1
    p = body["diagnosis"]["problems"][0]
    assert p["error_pattern_slug"] == pattern.slug


# ---- Answer key integration on assessments POST ----


async def test_create_assessment_stores_answer_key_id_and_flags(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    # Seed an answer key in the same org
    from grade_sight_api.models.answer_key import AnswerKey
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()

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
                        "files": [{"filename": "p.png", "content_type": "image/png"}],
                        "answer_key_id": str(key.id),
                        "already_graded": True,
                        "review_all": False,
                    },
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201

    asmt_rows = (
        await async_session.execute(select(Assessment))
    ).scalars().all()
    assert len(asmt_rows) == 1
    a = asmt_rows[0]
    assert a.answer_key_id == key.id
    assert a.already_graded is True
    assert a.review_all is False


@pytest.mark.db
async def test_get_assessment_applies_review_overlay(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """A mark-correct review on an assessment flows through GET as effective is_correct=True + populated review sub-object."""
    from decimal import Decimal

    from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
    from grade_sight_api.models.diagnostic_review import DiagnosticReview
    from grade_sight_api.models.problem_observation import ProblemObservation

    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user, name="Ada")
    asmt = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.completed,
    )
    async_session.add(asmt)
    await async_session.flush()
    async_session.add(
        AssessmentPage(
            assessment_id=asmt.id,
            page_number=1,
            s3_url=f"k/{asmt.id}/page-001.png",
            original_filename="p1.png",
            content_type="image/png",
            organization_id=user.organization_id,
        )
    )
    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=user.organization_id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=100,
        tokens_output=20,
        cost_usd=Decimal("0.0123"),
        latency_ms=12345,
        overall_summary="Test summary.",
    )
    async_session.add(diag)
    await async_session.flush()
    async_session.add(
        ProblemObservation(
            diagnosis_id=diag.id,
            organization_id=user.organization_id,
            problem_number=1,
            page_number=1,
            student_answer="2x",
            correct_answer="x + 2",
            is_correct=False,
        )
    )
    await async_session.flush()

    # Create a mark-correct review for problem 1.
    from datetime import UTC, datetime
    review = DiagnosticReview(
        assessment_id=asmt.id,
        problem_number=1,
        marked_correct=True,
        reviewed_by=user.id,
        reviewed_at=datetime.now(UTC).replace(tzinfo=None),
    )
    async_session.add(review)
    await async_session.flush()

    _override_deps(user, async_session)
    fake_get_url = "https://r2.example/get?sig=overlay"
    try:
        with patch(
            "grade_sight_api.routers.assessments.storage_service.get_download_url",
            new=AsyncMock(return_value=fake_get_url),
        ):
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
    problems = body["diagnosis"]["problems"]
    assert len(problems) == 1
    assert problems[0]["is_correct"] is True  # effective state from mark-correct
    assert problems[0]["review"] is not None
    assert problems[0]["review"]["marked_correct"] is True


# ---- GET /api/assessments — new fields: has_key, headline_inputs, pagination ----


async def test_list_assessments_has_key_reflects_answer_key_id(
    async_session: AsyncSession,
) -> None:
    """has_key=True when answer_key_id is set; False when null."""
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()

    a_with_key = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        answer_key_id=key.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 28, tzinfo=timezone.utc).replace(tzinfo=None),
    )
    a_no_key = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        answer_key_id=None,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 27, tzinfo=timezone.utc).replace(tzinfo=None),
    )
    async_session.add(a_with_key)
    async_session.add(a_no_key)
    await async_session.flush()

    for a in (a_with_key, a_no_key):
        async_session.add(
            AssessmentPage(
                assessment_id=a.id,
                page_number=1,
                s3_url=f"k/{a.id}/page-001.png",
                original_filename="page-1.png",
                content_type="image/png",
                organization_id=user.organization_id,
            )
        )
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=hk"
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
    by_id = {a["id"]: a for a in body["assessments"]}
    assert by_id[str(a_with_key.id)]["has_key"] is True
    assert by_id[str(a_no_key.id)]["has_key"] is False


async def _seed_completed_assessment(
    session: AsyncSession,
    user: User,
    problems: list[dict[str, Any]],
    total_problems_seen: int | None = None,
    overall_summary: str = "ok",
    uploaded_at: datetime | None = None,
) -> tuple[Student, Assessment]:
    """Seed a completed assessment with diagnosis + observations for list-endpoint tests."""
    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="S",
    )
    session.add(student)
    await session.flush()

    ts = uploaded_at or datetime(2026, 4, 28)
    a = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.completed,
        uploaded_at=ts,
    )
    session.add(a)
    await session.flush()

    session.add(
        AssessmentPage(
            assessment_id=a.id,
            page_number=1,
            s3_url=f"k/{a.id}/page-001.png",
            original_filename="page-1.png",
            content_type="image/png",
            organization_id=user.organization_id,
        )
    )

    diag = AssessmentDiagnosis(
        assessment_id=a.id,
        organization_id=user.organization_id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=10,
        tokens_output=5,
        cost_usd=Decimal("0.001"),
        latency_ms=100,
        overall_summary=overall_summary,
        total_problems_seen=total_problems_seen if total_problems_seen is not None else len(problems),
    )
    session.add(diag)
    await session.flush()

    for p in problems:
        session.add(
            ProblemObservation(
                diagnosis_id=diag.id,
                organization_id=user.organization_id,
                problem_number=p["problem_number"],
                page_number=1,
                student_answer=p.get("student_answer", "ans"),
                correct_answer=p.get("correct_answer", "corr"),
                is_correct=p["is_correct"],
                error_pattern_id=p.get("pattern_id"),
            )
        )
    await session.flush()
    return student, a


async def test_list_assessments_headline_inputs_null_for_processing(
    async_session: AsyncSession,
) -> None:
    """headline_inputs is None for non-completed statuses."""
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    a = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.processing,
        uploaded_at=datetime(2026, 4, 28),
    )
    async_session.add(a)
    await async_session.flush()
    async_session.add(
        AssessmentPage(
            assessment_id=a.id,
            page_number=1,
            s3_url=f"k/{a.id}/page-001.png",
            original_filename="page-1.png",
            content_type="image/png",
            organization_id=user.organization_id,
        )
    )
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=null"
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
    assert body["assessments"][0]["headline_inputs"] is None


async def test_list_assessments_headline_inputs_populated_for_completed(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """headline_inputs is populated for completed assessments with a diagnosis."""
    user = await _seed_user(async_session)
    pattern = seed_minimal_taxonomy["pattern"]

    _, a = await _seed_completed_assessment(
        async_session,
        user,
        problems=[
            {"problem_number": 1, "is_correct": True},
            {"problem_number": 2, "is_correct": False, "pattern_id": pattern.id},
            {"problem_number": 3, "is_correct": False, "pattern_id": pattern.id},
        ],
        total_problems_seen=3,
        overall_summary="2 wrong.",
    )

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=pop"
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
    hi = body["assessments"][0]["headline_inputs"]
    assert hi is not None
    assert hi["total_problems_seen"] == 3
    assert hi["overall_summary"] == "2 wrong."
    assert len(hi["problems"]) == 3
    assert hi["problems"][0]["problem_number"] == 1
    assert hi["problems"][0]["is_correct"] is True
    assert hi["problems"][1]["error_pattern_slug"] == pattern.slug


async def test_list_assessments_headline_inputs_reflects_review_overlay(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """Review overlay flips is_correct for mark-correct reviews in list endpoint."""
    user = await _seed_user(async_session)

    _, a = await _seed_completed_assessment(
        async_session,
        user,
        problems=[
            {"problem_number": 1, "is_correct": False},
        ],
        overall_summary="1 wrong.",
    )

    review = DiagnosticReview(
        assessment_id=a.id,
        problem_number=1,
        marked_correct=True,
        reviewed_by=user.id,
        reviewed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    async_session.add(review)
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=ov"
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
    hi = body["assessments"][0]["headline_inputs"]
    assert hi is not None
    assert len(hi["problems"]) == 1
    assert hi["problems"][0]["is_correct"] is True  # overlay applied


async def test_list_assessments_headline_inputs_reflects_pattern_override(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """Override-pattern review updates error_pattern_slug/name but not is_correct."""
    user = await _seed_user(async_session)

    # Pattern A is what the engine originally tagged; Pattern B is the override.
    pattern_a = seed_minimal_taxonomy["pattern"]
    subcategory = seed_minimal_taxonomy["subcategory"]

    pattern_b = ErrorPattern(
        slug="fraction-invert-error",
        subcategory_id=subcategory.id,
        name="Fraction invert error",
        description="Inverted numerator/denominator when dividing fractions.",
        canonical_example="1/2 ÷ 3/4 → 1/2 × 3/4 (incorrect)",
        severity_hint="medium",
    )
    async_session.add(pattern_b)
    await async_session.flush()

    _, a = await _seed_completed_assessment(
        async_session,
        user,
        problems=[
            {
                "problem_number": 1,
                "is_correct": False,
                "pattern_id": pattern_a.id,
            },
        ],
        overall_summary="1 wrong.",
    )

    review = DiagnosticReview(
        assessment_id=a.id,
        problem_number=1,
        marked_correct=False,
        override_pattern_id=pattern_b.id,
        reviewed_by=user.id,
        reviewed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    async_session.add(review)
    await async_session.flush()

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=pat-ov"
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
    hi = body["assessments"][0]["headline_inputs"]
    assert hi is not None
    assert len(hi["problems"]) == 1
    p = hi["problems"][0]
    # Override swaps the pattern but does NOT flip correctness.
    assert p["error_pattern_slug"] == pattern_b.slug
    assert p["error_pattern_name"] == pattern_b.name
    assert p["is_correct"] is False


async def _seed_assessment_at(
    session: AsyncSession,
    user: User,
    dt: datetime,
) -> Assessment:
    """Seed a minimal pending assessment with one page at a specific uploaded_at."""
    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="X",
    )
    session.add(student)
    await session.flush()
    a = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
        uploaded_at=dt,
    )
    session.add(a)
    await session.flush()
    session.add(
        AssessmentPage(
            assessment_id=a.id,
            page_number=1,
            s3_url=f"k/{a.id}/page-001.png",
            original_filename="page-1.png",
            content_type="image/png",
            organization_id=user.organization_id,
        )
    )
    await session.flush()
    return a


async def test_list_assessments_since_filter(
    async_session: AsyncSession,
) -> None:
    """since=2026-04-22 returns only Apr 25 and Apr 30, in desc order."""
    user = await _seed_user(async_session)
    a15 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 15))
    a20 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 20))
    a25 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 25))
    a30 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 30))

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=since"
    try:
        with _patch_r2_client(fake_url):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.get(
                    "/api/assessments?since=2026-04-22",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    ids = [a["id"] for a in body["assessments"]]
    assert str(a30.id) in ids
    assert str(a25.id) in ids
    assert str(a20.id) not in ids
    assert str(a15.id) not in ids
    # Descending order
    assert ids[0] == str(a30.id)
    assert ids[1] == str(a25.id)


async def test_list_assessments_until_filter_inclusive(
    async_session: AsyncSession,
) -> None:
    """until=2026-04-25 returns Apr 25, 20, 15 (inclusive of the date itself)."""
    user = await _seed_user(async_session)
    a15 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 15))
    a20 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 20))
    a25 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 25))
    a30 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 30))

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=until"
    try:
        with _patch_r2_client(fake_url):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                r = await client.get(
                    "/api/assessments?until=2026-04-25",
                    headers={"Authorization": "Bearer fake"},
                )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    ids = [a["id"] for a in body["assessments"]]
    assert str(a25.id) in ids
    assert str(a20.id) in ids
    assert str(a15.id) in ids
    assert str(a30.id) not in ids
    # Descending order
    assert ids[0] == str(a25.id)
    assert ids[1] == str(a20.id)
    assert ids[2] == str(a15.id)


async def test_list_assessments_cursor_pagination(
    async_session: AsyncSession,
) -> None:
    """limit=2 cursor pagination over 5 assessments (Apr 26-30)."""
    user = await _seed_user(async_session)
    a26 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 26))
    a27 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 27))
    a28 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 28))
    a29 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 29))
    a30 = await _seed_assessment_at(async_session, user, datetime(2026, 4, 30))

    _override_deps(user, async_session)
    fake_url = "https://r2.example/get?sig=pag"
    try:
        with _patch_r2_client(fake_url):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t"
            ) as client:
                # Page 1
                r1 = await client.get(
                    "/api/assessments?limit=2",
                    headers={"Authorization": "Bearer fake"},
                )
                assert r1.status_code == 200
                b1 = r1.json()
                assert [a["id"] for a in b1["assessments"]] == [
                    str(a30.id), str(a29.id)
                ]
                assert b1["has_more"] is True
                next_cursor = b1["next_cursor"]
                assert next_cursor is not None

                # Page 2
                r2 = await client.get(
                    f"/api/assessments?limit=2&cursor={next_cursor}",
                    headers={"Authorization": "Bearer fake"},
                )
                assert r2.status_code == 200
                b2 = r2.json()
                assert [a["id"] for a in b2["assessments"]] == [
                    str(a28.id), str(a27.id)
                ]
                assert b2["has_more"] is True
                next_cursor2 = b2["next_cursor"]
                assert next_cursor2 is not None

                # Page 3 (last)
                r3 = await client.get(
                    f"/api/assessments?limit=2&cursor={next_cursor2}",
                    headers={"Authorization": "Bearer fake"},
                )
                assert r3.status_code == 200
                b3 = r3.json()
                assert [a["id"] for a in b3["assessments"]] == [str(a26.id)]
                assert b3["has_more"] is False
                assert b3["next_cursor"] is None
    finally:
        app.dependency_overrides.clear()


async def test_create_assessment_rejects_cross_org_answer_key(
    async_session: AsyncSession,
) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)
    student_a = await _seed_student(async_session, user_a)

    from grade_sight_api.models.answer_key import AnswerKey
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
            r = await client.post(
                "/api/assessments",
                json={
                    "student_id": str(student_a.id),
                    "files": [{"filename": "p.png", "content_type": "image/png"}],
                    "answer_key_id": str(key_b.id),
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403
