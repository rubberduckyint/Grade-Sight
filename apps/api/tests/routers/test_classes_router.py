"""Tests for the classes router."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.main import app
from grade_sight_api.auth import dependencies
from grade_sight_api.db.session import get_session
from grade_sight_api.models.class_member import ClassMember
from grade_sight_api.models.klass import Klass
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_teacher(
    async_session: AsyncSession,
    *,
    org: Organization | None = None,
) -> tuple[User, Organization]:
    if org is None:
        org = Organization(name="org")
        async_session.add(org)
        await async_session.flush()
    teacher = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"teacher_{uuid4()}@test.local",
        role=UserRole.teacher,
        organization_id=org.id,
    )
    async_session.add(teacher)
    await async_session.commit()
    return teacher, org


def _override_deps(async_session: AsyncSession, user: User) -> None:
    async def _user_dep() -> User:
        return user

    async def _session_dep() -> AsyncGenerator[AsyncSession, None]:
        yield async_session

    app.dependency_overrides[dependencies.get_current_user] = _user_dep
    app.dependency_overrides[get_session] = _session_dep


@pytest.mark.asyncio
async def test_list_classes_returns_only_teachers_own(async_session):
    teacher_a, org = await _seed_teacher(async_session)
    teacher_b, _ = await _seed_teacher(async_session, org=org)

    klass_a = Klass(organization_id=org.id, teacher_id=teacher_a.id, name="A's class")
    klass_b = Klass(organization_id=org.id, teacher_id=teacher_b.id, name="B's class")
    async_session.add_all([klass_a, klass_b])
    await async_session.commit()

    _override_deps(async_session, teacher_a)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/classes")
        assert resp.status_code == 200
        data = resp.json()
        names = [c["name"] for c in data["classes"]]
        assert names == ["A's class"]
        assert data["has_archived"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_classes_excludes_other_org(async_session):
    teacher_a, _ = await _seed_teacher(async_session)
    other_org = Organization(name="other")
    async_session.add(other_org)
    await async_session.flush()
    teacher_b = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"b_{uuid4()}@test.local",
        role=UserRole.teacher,
        organization_id=other_org.id,
    )
    async_session.add(teacher_b)
    await async_session.flush()
    async_session.add(Klass(organization_id=other_org.id, teacher_id=teacher_b.id, name="other org"))
    await async_session.commit()

    _override_deps(async_session, teacher_a)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/classes")
        assert resp.json()["classes"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_classes_archived_toggle(async_session):
    teacher, org = await _seed_teacher(async_session)
    active = Klass(organization_id=org.id, teacher_id=teacher.id, name="active")
    archived = Klass(
        organization_id=org.id, teacher_id=teacher.id, name="archived",
        deleted_at=datetime(2026, 4, 1),
    )
    async_session.add_all([active, archived])
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r1 = await client.get("/api/classes")
            r2 = await client.get("/api/classes?include_archived=true")
        names_default = [c["name"] for c in r1.json()["classes"]]
        names_with_archived = [c["name"] for c in r2.json()["classes"]]
        assert names_default == ["active"]
        assert sorted(names_with_archived) == ["active", "archived"]
        assert r1.json()["has_archived"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_classes_student_count_excludes_left_and_deleted(async_session):
    teacher, org = await _seed_teacher(async_session)
    student_active = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="Active")
    student_left = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="Left")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([student_active, student_left, klass])
    await async_session.flush()
    async_session.add_all([
        ClassMember(class_id=klass.id, student_id=student_active.id, organization_id=org.id),
        ClassMember(class_id=klass.id, student_id=student_left.id, organization_id=org.id, left_at=datetime(2026, 4, 1)),
    ])
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/classes")
        assert resp.json()["classes"][0]["student_count"] == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_classes_parent_returns_404(async_session):
    org = Organization(name="org")
    async_session.add(org)
    await async_session.flush()
    parent = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"p_{uuid4()}@test.local",
        role=UserRole.parent,
        organization_id=org.id,
    )
    async_session.add(parent)
    await async_session.commit()

    _override_deps(async_session, parent)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/classes")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_class_happy_path(async_session):
    teacher, _ = await _seed_teacher(async_session)
    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/classes",
                json={"name": "4th period", "subject": "Algebra 1", "grade_level": "9"},
            )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "4th period"
        assert body["subject"] == "Algebra 1"
        assert body["grade_level"] == "9"
        assert body["archived"] is False
        assert body["student_count"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_class_name_required(async_session):
    teacher, _ = await _seed_teacher(async_session)
    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/classes", json={"name": "  "})
        assert resp.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_class_subject_and_grade_optional(async_session):
    teacher, _ = await _seed_teacher(async_session)
    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/classes", json={"name": "Period 1"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["subject"] is None
        assert body["grade_level"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_class_detail_returns_roster_with_student_names(async_session):
    teacher, org = await _seed_teacher(async_session)
    student = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="Marcus Reilly")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([student, klass])
    await async_session.flush()
    async_session.add(ClassMember(class_id=klass.id, student_id=student.id, organization_id=org.id))
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/classes/{klass.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "K"
        assert len(data["roster"]) == 1
        assert data["roster"][0]["student_name"] == "Marcus Reilly"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_class_detail_cross_teacher_returns_404(async_session):
    teacher_a, org = await _seed_teacher(async_session)
    teacher_b, _ = await _seed_teacher(async_session, org=org)
    klass_b = Klass(organization_id=org.id, teacher_id=teacher_b.id, name="B's class")
    async_session.add(klass_b)
    await async_session.commit()

    _override_deps(async_session, teacher_a)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/classes/{klass_b.id}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_class_detail_archived_returns_archived_flag(async_session):
    teacher, org = await _seed_teacher(async_session)
    klass = Klass(
        organization_id=org.id, teacher_id=teacher.id, name="K",
        deleted_at=datetime(2026, 4, 1),
    )
    async_session.add(klass)
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/classes/{klass.id}")
        assert resp.status_code == 200
        assert resp.json()["archived"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_class_detail_excludes_left_students(async_session):
    teacher, org = await _seed_teacher(async_session)
    student_active = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="Active")
    student_left = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="Left")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([student_active, student_left, klass])
    await async_session.flush()
    async_session.add_all([
        ClassMember(class_id=klass.id, student_id=student_active.id, organization_id=org.id),
        ClassMember(class_id=klass.id, student_id=student_left.id, organization_id=org.id, left_at=datetime(2026, 4, 1)),
    ])
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/classes/{klass.id}")
        names = [m["student_name"] for m in resp.json()["roster"]]
        assert names == ["Active"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_class_updates_name(async_session):
    teacher, org = await _seed_teacher(async_session)
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="Old")
    async_session.add(klass)
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(f"/api/classes/{klass.id}", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_class_archive_sets_deleted_at(async_session):
    teacher, org = await _seed_teacher(async_session)
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add(klass)
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(f"/api/classes/{klass.id}", json={"archived": True})
        assert resp.status_code == 200
        assert resp.json()["archived"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_class_unarchive_clears_deleted_at(async_session):
    teacher, org = await _seed_teacher(async_session)
    klass = Klass(
        organization_id=org.id, teacher_id=teacher.id, name="K",
        deleted_at=datetime(2026, 4, 1),
    )
    async_session.add(klass)
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(f"/api/classes/{klass.id}", json={"archived": False})
        assert resp.status_code == 200
        assert resp.json()["archived"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_class_empty_body_returns_unchanged(async_session):
    teacher, org = await _seed_teacher(async_session)
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add(klass)
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(f"/api/classes/{klass.id}", json={})
        assert resp.status_code == 200
        assert resp.json()["name"] == "K"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_class_cross_teacher_returns_404(async_session):
    teacher_a, org = await _seed_teacher(async_session)
    teacher_b, _ = await _seed_teacher(async_session, org=org)
    klass_b = Klass(organization_id=org.id, teacher_id=teacher_b.id, name="B's class")
    async_session.add(klass_b)
    await async_session.commit()

    _override_deps(async_session, teacher_a)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(f"/api/classes/{klass_b.id}", json={"name": "hijacked"})
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()
