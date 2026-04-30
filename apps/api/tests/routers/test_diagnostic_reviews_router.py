"""Tests for the diagnostic-reviews router.

POST   /api/assessments/{id}/reviews  — 6 tests
PATCH  /api/assessments/{id}/reviews/{review_id} — 1 test (covers 2 branches)
DELETE /api/assessments/{id}/reviews/{review_id} — 1 test

Total: 8 pytest cases.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _override_deps(user: User, session: AsyncSession) -> None:
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session


async def _seed_org(session: AsyncSession, name: str = "Test Org") -> Organization:
    org = Organization(name=name)
    session.add(org)
    await session.flush()
    return org


async def _seed_teacher(
    session: AsyncSession,
    *,
    org_id: UUID,
    first_name: str = "Test",
    last_name: str = "Teacher",
) -> User:
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name=first_name,
        last_name=last_name,
        organization_id=org_id,
    )
    session.add(user)
    await session.flush()
    return user


async def _seed_parent(session: AsyncSession) -> User:
    """Parent user — no organization."""
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.parent,
        first_name="Parent",
        last_name="User",
        organization_id=None,
    )
    session.add(user)
    await session.flush()
    return user


async def _seed_student(session: AsyncSession, *, org_id: UUID, user_id: UUID) -> Student:
    student = Student(
        created_by_user_id=user_id,
        organization_id=org_id,
        full_name="Test Student",
    )
    session.add(student)
    await session.flush()
    return student


async def _seed_assessment(
    session: AsyncSession,
    *,
    student: Student,
    org_id: UUID,
    user_id: UUID,
) -> Assessment:
    asmt = Assessment(
        student_id=student.id,
        organization_id=org_id,
        uploaded_by_user_id=user_id,
        status=AssessmentStatus.pending,
    )
    session.add(asmt)
    await session.flush()
    return asmt


async def _seed_taxonomy(
    session: AsyncSession,
) -> ErrorPattern:
    """Seed a minimal 3-level taxonomy: Category → Subcategory → Pattern."""
    cat = ErrorCategory(
        slug=f"execution-{uuid4().hex[:6]}",
        name="Execution",
        definition="Errors during the mechanical steps of solving.",
        distinguishing_marker="Visible mistake in the math itself.",
        severity_rank=2,
    )
    session.add(cat)
    await session.flush()
    sub = ErrorSubcategory(
        slug=f"exec-arith-{uuid4().hex[:6]}",
        category_id=cat.id,
        name="Arithmetic",
        definition="Arithmetic mistakes during a problem's solution.",
    )
    session.add(sub)
    await session.flush()
    pat = ErrorPattern(
        slug=f"sign-error-{uuid4().hex[:6]}",
        subcategory_id=sub.id,
        name="Sign error in distribution",
        description="Lost a sign while distributing a coefficient.",
        canonical_example="-2(x-4)=6 -> -2x-8=6 (incorrect)",
        severity_hint="medium",
    )
    session.add(pat)
    await session.flush()
    return pat


# ---------------------------------------------------------------------------
# Test 1 — create with marked_correct
# ---------------------------------------------------------------------------


async def test_create_with_mark_correct(async_session: AsyncSession) -> None:
    """POST {problem_number: 3, marked_correct: True} → 201, audit row written."""
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )

    _override_deps(teacher, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={"problem_number": 3, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201
    body = r.json()
    assert body["marked_correct"] is True
    assert body["override_pattern_id"] is None
    assert body["override_pattern_slug"] is None
    assert body["override_pattern_name"] is None
    assert "reviewed_at" in body
    assert body["reviewed_by_name"] == "Test Teacher"

    # Verify audit_log row written
    audit_rows = (
        await async_session.execute(
            select(AuditLog).where(AuditLog.action == "diagnostic_review.create")
        )
    ).scalars().all()
    assert len(audit_rows) >= 1
    assert any(str(asmt.id) in str(row.event_metadata) for row in audit_rows)


# ---------------------------------------------------------------------------
# Test 2 — create with override_pattern_id
# ---------------------------------------------------------------------------


async def test_create_with_override_pattern(async_session: AsyncSession) -> None:
    """POST with override_pattern_id → 201, slug/name present in response."""
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )
    pattern = await _seed_taxonomy(async_session)

    _override_deps(teacher, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={
                    "problem_number": 5,
                    "override_pattern_id": str(pattern.id),
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201
    body = r.json()
    assert body["marked_correct"] is False
    assert body["override_pattern_id"] == str(pattern.id)
    assert body["override_pattern_slug"] == pattern.slug
    assert body["override_pattern_name"] == pattern.name


# ---------------------------------------------------------------------------
# Test 3 — XOR validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        # Both set — invalid
        {"problem_number": 1, "marked_correct": True, "override_pattern_id": str(uuid4())},
        # Neither set — invalid
        {"problem_number": 1, "marked_correct": False},
    ],
)
async def test_create_validates_xor(
    async_session: AsyncSession, payload: dict
) -> None:
    """Both set or neither set → 422."""
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )

    _override_deps(teacher, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json=payload,
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Test 4 — wrong-org teacher blocked
# ---------------------------------------------------------------------------


async def test_create_blocks_wrong_org(async_session: AsyncSession) -> None:
    """Teacher from different org → 403."""
    org_a = await _seed_org(async_session, name="Org A")
    org_b = await _seed_org(async_session, name="Org B")
    teacher_a = await _seed_teacher(async_session, org_id=org_a.id)
    teacher_b = await _seed_teacher(async_session, org_id=org_b.id)
    student_a = await _seed_student(
        async_session, org_id=org_a.id, user_id=teacher_a.id
    )
    asmt_a = await _seed_assessment(
        async_session, student=student_a, org_id=org_a.id, user_id=teacher_a.id
    )

    # teacher_b tries to review org_a's assessment
    _override_deps(teacher_b, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                f"/api/assessments/{asmt_a.id}/reviews",
                json={"problem_number": 1, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Test 5 — parent (no org) blocked
# ---------------------------------------------------------------------------


async def test_create_blocks_no_org_user(async_session: AsyncSession) -> None:
    """Parent user (organization_id=None) → 403."""
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    parent = await _seed_parent(async_session)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )

    _override_deps(parent, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={"problem_number": 1, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Test 6 — duplicate → 409
# ---------------------------------------------------------------------------


async def test_create_duplicate_returns_409(async_session: AsyncSession) -> None:
    """Second POST for same (assessment, problem_number) → 409."""
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )

    _override_deps(teacher, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r1 = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={"problem_number": 7, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
            assert r1.status_code == 201

            r2 = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={"problem_number": 7, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# Test 7 — PATCH merges and re-validates
# ---------------------------------------------------------------------------


async def test_update_merges_and_revalidates(async_session: AsyncSession) -> None:
    """Create with mark-correct, PATCH to switch to override-pattern → 200.

    Then PATCH again clearing both → 422.
    """
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )
    pattern = await _seed_taxonomy(async_session)

    _override_deps(teacher, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            # Create
            r_create = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={"problem_number": 2, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
            assert r_create.status_code == 201
            review_id = r_create.json()["id"]

            # PATCH: flip to override-pattern (unset marked_correct, set pattern)
            r_patch = await client.patch(
                f"/api/assessments/{asmt.id}/reviews/{review_id}",
                json={
                    "marked_correct": False,
                    "override_pattern_id": str(pattern.id),
                },
                headers={"Authorization": "Bearer fake"},
            )
            assert r_patch.status_code == 200
            body = r_patch.json()
            assert body["marked_correct"] is False
            assert body["override_pattern_id"] == str(pattern.id)

            # PATCH: clear both → invalid merged state → 422
            r_invalid = await client.patch(
                f"/api/assessments/{asmt.id}/reviews/{review_id}",
                json={
                    "marked_correct": False,
                    "override_pattern_id": None,
                },
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r_invalid.status_code == 422


# ---------------------------------------------------------------------------
# Test 8 — DELETE soft-deletes + audit
# ---------------------------------------------------------------------------


async def test_delete_soft_deletes(async_session: AsyncSession) -> None:
    """DELETE → 204. Row still exists with deleted_at set. Audit row written."""
    org = await _seed_org(async_session)
    teacher = await _seed_teacher(async_session, org_id=org.id)
    student = await _seed_student(async_session, org_id=org.id, user_id=teacher.id)
    asmt = await _seed_assessment(
        async_session, student=student, org_id=org.id, user_id=teacher.id
    )

    _override_deps(teacher, async_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            r_create = await client.post(
                f"/api/assessments/{asmt.id}/reviews",
                json={"problem_number": 4, "marked_correct": True},
                headers={"Authorization": "Bearer fake"},
            )
            assert r_create.status_code == 201
            review_id = UUID(r_create.json()["id"])

            r_delete = await client.delete(
                f"/api/assessments/{asmt.id}/reviews/{review_id}",
                headers={"Authorization": "Bearer fake"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r_delete.status_code == 204

    # Row still exists with deleted_at set (soft delete)
    review_row = (
        await async_session.execute(
            select(DiagnosticReview).where(DiagnosticReview.id == review_id)
        )
    ).scalar_one_or_none()
    assert review_row is not None
    assert review_row.deleted_at is not None

    # Audit log row for delete
    audit_rows = (
        await async_session.execute(
            select(AuditLog).where(AuditLog.action == "diagnostic_review.delete")
        )
    ).scalars().all()
    assert len(audit_rows) >= 1
