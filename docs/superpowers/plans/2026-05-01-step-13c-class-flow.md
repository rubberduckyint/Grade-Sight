# Step 13c · Teacher Class Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the teacher class-creation flow so teachers can group students into classes and manage rosters. Schema is already in place from Spec 2; this step adds the API surface and UI.

**Architecture:** Six new endpoints under `/api/classes` (no service layer — CRUD logic stays in the router). New `/classes` and `/classes/[id]` pages with shadcn Dialog forms for create/edit/add-students. Subject is a dropdown of common math courses with "Other…" fallback. Archive via soft-delete with a `Show archived` toggle. All endpoints scope by `(organization_id, teacher_id)` — cross-teacher access returns 404.

**Tech Stack:** FastAPI + SQLAlchemy 2 (async) + pydantic v2; Next.js 16 server components + shadcn Dialog/Select/Checkbox; existing patterns from Steps 13a/13b.

**Spec:** `docs/superpowers/specs/2026-05-01-step-13c-class-flow-design.md`

**Branch:** `step-13c-class-flow` (already created at `c7ee830` with spec committed).

**Reality-check findings before drafting:**

1. Schema is in place — `Klass` (`models/klass.py`) and `ClassMember` (`models/class_member.py`) already have all needed fields including `SoftDeleteMixin` (`deleted_at`) and the partial unique index. **No migrations needed.**
2. `StudentProfile.grade_level` exists (per Step 12 biography work) — used to surface grade in roster rows.
3. Router registration pattern in `main.py` lines 39-46 — append `app.include_router(classes_router.router)`.
4. Existing models confirmed: `Student.created_by_user_id` (parent path; not relevant here), `Assessment.uploaded_by_user_id` (not touched in this step), `User.role: UserRole.{parent, teacher, admin}`.
5. Datetime convention: `deleted_at`, `left_at`, `joined_at` are all tz-naive — write `datetime.now(timezone.utc).replace(tzinfo=None)`.
6. Test fixture pattern (matches `tests/routers/test_answer_keys_router.py`): `async_session` fixture + `_seed_user` + `_override_deps(app, async_session, user)` + inline `AsyncClient(transport=ASGITransport(app=app), base_url="http://test")`.

---

## Task 1: Backend · schemas + router scaffold + main.py registration

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/classes.py`
- Create: `apps/api/src/grade_sight_api/routers/classes.py`
- Modify: `apps/api/src/grade_sight_api/main.py`

This task lays the groundwork — pydantic schemas, an empty router with auth helpers, and the `main.py` registration. No endpoints yet; those come in Tasks 2-4.

- [ ] **Step 1: Create `schemas/classes.py`**

```python
"""Pydantic schemas for the classes router."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ClassCreate(BaseModel):
    name: str
    subject: str | None = None
    grade_level: str | None = None


class ClassUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    archived: bool | None = None


class ClassListItem(BaseModel):
    id: UUID
    name: str
    subject: str | None
    grade_level: str | None
    archived: bool
    student_count: int
    created_at: datetime


class ClassListResponse(BaseModel):
    classes: list[ClassListItem]
    has_archived: bool


class ClassRosterMember(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    student_grade_level: str | None
    joined_at: datetime


class ClassDetailResponse(BaseModel):
    id: UUID
    name: str
    subject: str | None
    grade_level: str | None
    archived: bool
    roster: list[ClassRosterMember]
    created_at: datetime


class AddMembersRequest(BaseModel):
    student_ids: list[UUID]
```

- [ ] **Step 2: Create `routers/classes.py` scaffold**

```python
"""Classes router — teacher-only CRUD for classes + roster management."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.class_member import ClassMember
from ..models.klass import Klass
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.user import User, UserRole
from ..schemas.classes import (
    AddMembersRequest,
    ClassCreate,
    ClassDetailResponse,
    ClassListItem,
    ClassListResponse,
    ClassRosterMember,
    ClassUpdate,
)

router = APIRouter()


def _require_teacher(user: User) -> None:
    """Raise 404 for non-teacher users — matches the page-level pattern."""
    if user.role != UserRole.teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


async def _get_class_or_404(class_id: UUID, user: User, db: AsyncSession) -> Klass:
    """Look up a class by id, scoped to the teacher's org and ownership.

    Returns the class regardless of archived state so PATCH archived=false
    can unarchive.
    """
    klass = await db.scalar(
        select(Klass).where(
            Klass.id == class_id,
            Klass.organization_id == user.organization_id,
            Klass.teacher_id == user.id,
        )
    )
    if klass is None:
        raise HTTPException(status_code=404, detail="class not found")
    return klass


async def _build_detail_response(
    klass: Klass, db: AsyncSession
) -> ClassDetailResponse:
    """Fetch the active roster for a class and return the full detail."""
    roster_stmt = (
        select(ClassMember, Student.full_name, StudentProfile.grade_level)
        .join(Student, ClassMember.student_id == Student.id)
        .outerjoin(StudentProfile, StudentProfile.student_id == Student.id)
        .where(
            ClassMember.class_id == klass.id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    roster_rows = (await db.execute(roster_stmt)).all()

    return ClassDetailResponse(
        id=klass.id,
        name=klass.name,
        subject=klass.subject,
        grade_level=klass.grade_level,
        archived=klass.deleted_at is not None,
        roster=[
            ClassRosterMember(
                id=m.id,
                student_id=m.student_id,
                student_name=name,
                student_grade_level=grade,
                joined_at=m.joined_at,
            )
            for m, name, grade in roster_rows
        ],
        created_at=klass.created_at,
    )
```

- [ ] **Step 3: Register the router in `main.py`**

Edit `apps/api/src/grade_sight_api/main.py`. After `app.include_router(error_patterns_router.router)` (line 45), add:

```python
from .routers import classes as classes_router
# ... (in the include_router block)
app.include_router(classes_router.router)
```

If imports are grouped at the top of the file, add the `from .routers import classes as classes_router` import alongside the other router imports.

- [ ] **Step 4: Run mypy**

Run: `cd apps/api && uv run mypy src`
Expected: clean (no new errors).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/classes.py apps/api/src/grade_sight_api/routers/classes.py apps/api/src/grade_sight_api/main.py
git commit -m "api: scaffold classes router + schemas + helpers"
```

---

## Task 2: Backend · `GET /api/classes` + `POST /api/classes`

**Files:**
- Modify: `apps/api/src/grade_sight_api/routers/classes.py`
- Create: `apps/api/tests/routers/test_classes_router.py`

### Step 1: Write the failing list-endpoint test

Create `apps/api/tests/routers/test_classes_router.py`:

```python
"""Tests for the classes router."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from grade_sight_api.main import app
from grade_sight_api.auth import dependencies
from grade_sight_api.db.session import get_session
from grade_sight_api.models.class_member import ClassMember
from grade_sight_api.models.klass import Klass
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_teacher(async_session, *, org=None):
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


def _override_deps(async_session, user):
    async def _user_dep():
        return user
    async def _session_dep():
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
```

### Step 2: Run the test → fail

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py::test_list_classes_returns_only_teachers_own -v`
Expected: FAIL — endpoint doesn't exist (404 from FastAPI).

### Step 3: Implement `GET /api/classes`

Append to `apps/api/src/grade_sight_api/routers/classes.py`:

```python
@router.get("/api/classes", response_model=ClassListResponse)
async def list_classes(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListResponse:
    """List the teacher's classes for their org. Active by default; pass
    include_archived=true to include soft-deleted ones."""
    _require_teacher(user)

    count_subq = (
        select(
            ClassMember.class_id.label("class_id"),
            func.count(ClassMember.id).label("student_count"),
        )
        .where(
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .group_by(ClassMember.class_id)
        .subquery()
    )

    base_filter = [
        Klass.organization_id == user.organization_id,
        Klass.teacher_id == user.id,
    ]

    stmt = (
        select(Klass, count_subq.c.student_count)
        .outerjoin(count_subq, count_subq.c.class_id == Klass.id)
        .where(*base_filter)
    )
    if not include_archived:
        stmt = stmt.where(Klass.deleted_at.is_(None))
    stmt = stmt.order_by(Klass.created_at.desc())

    rows = (await db.execute(stmt)).all()

    has_archived_count = await db.scalar(
        select(func.count(Klass.id)).where(*base_filter, Klass.deleted_at.is_not(None))
    )
    has_archived = (has_archived_count or 0) > 0

    return ClassListResponse(
        classes=[
            ClassListItem(
                id=k.id,
                name=k.name,
                subject=k.subject,
                grade_level=k.grade_level,
                archived=k.deleted_at is not None,
                student_count=int(count or 0),
                created_at=k.created_at,
            )
            for k, count in rows
        ],
        has_archived=has_archived,
    )
```

### Step 4: Run the test → pass

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py::test_list_classes_returns_only_teachers_own -v`
Expected: PASS.

### Step 5: Add the rest of the list-endpoint tests

Append to `tests/routers/test_classes_router.py`:

```python
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
```

### Step 6: Add the create-endpoint tests + implement

Append the failing tests:

```python
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
```

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k create`
Expected: 3 FAILS (endpoint doesn't exist).

Implement in `routers/classes.py`:

```python
@router.post(
    "/api/classes",
    response_model=ClassListItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_class(
    payload: ClassCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListItem:
    _require_teacher(user)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    new_class = Klass(
        organization_id=user.organization_id,
        teacher_id=user.id,
        name=name,
        subject=payload.subject,
        grade_level=payload.grade_level,
    )
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)

    return ClassListItem(
        id=new_class.id,
        name=new_class.name,
        subject=new_class.subject,
        grade_level=new_class.grade_level,
        archived=False,
        student_count=0,
        created_at=new_class.created_at,
    )
```

### Step 7: All 7 list+create tests pass

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v`
Expected: 7 PASS.

### Step 8: Run mypy

Run: `cd apps/api && uv run mypy src tests`
Expected: clean.

### Step 9: Commit

```bash
git add apps/api/src/grade_sight_api/routers/classes.py apps/api/tests/routers/test_classes_router.py
git commit -m "api: GET + POST /api/classes (list with student_count, create)"
```

---

## Task 3: Backend · `GET /api/classes/{id}` + `PATCH /api/classes/{id}`

**Files:**
- Modify: `apps/api/src/grade_sight_api/routers/classes.py`
- Modify: `apps/api/tests/routers/test_classes_router.py`

### Step 1: Detail-endpoint failing tests

Append to `test_classes_router.py`:

```python
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
```

### Step 2: Run → fail

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k detail`
Expected: 4 FAILS.

### Step 3: Implement `GET /api/classes/{id}`

Append to `routers/classes.py`:

```python
@router.get("/api/classes/{class_id}", response_model=ClassDetailResponse)
async def get_class_detail(
    class_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassDetailResponse:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)
    return await _build_detail_response(klass, db)
```

### Step 4: Run detail tests → pass

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k detail`
Expected: 4 PASS.

### Step 5: PATCH-endpoint failing tests

Append to `test_classes_router.py`:

```python
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
```

### Step 6: Run → fail

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k patch`
Expected: 5 FAILS.

### Step 7: Implement `PATCH /api/classes/{id}`

Append to `routers/classes.py`:

```python
@router.patch("/api/classes/{class_id}", response_model=ClassListItem)
async def update_class(
    class_id: UUID,
    payload: ClassUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListItem:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    fields_to_set: dict[str, object] = {}
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        fields_to_set["name"] = new_name
    if payload.subject is not None:
        fields_to_set["subject"] = payload.subject
    if payload.grade_level is not None:
        fields_to_set["grade_level"] = payload.grade_level
    if payload.archived is True:
        fields_to_set["deleted_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
    elif payload.archived is False:
        fields_to_set["deleted_at"] = None

    if fields_to_set:
        await db.execute(
            update(Klass).where(Klass.id == klass.id).values(**fields_to_set)
        )
        await db.commit()
        await db.refresh(klass)

    student_count = await db.scalar(
        select(func.count(ClassMember.id)).where(
            ClassMember.class_id == klass.id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
    )

    return ClassListItem(
        id=klass.id,
        name=klass.name,
        subject=klass.subject,
        grade_level=klass.grade_level,
        archived=klass.deleted_at is not None,
        student_count=int(student_count or 0),
        created_at=klass.created_at,
    )
```

### Step 8: All 16 tests so far pass + mypy clean

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v`
Expected: 16 PASS.

Run: `cd apps/api && uv run mypy src tests`
Expected: clean.

### Step 9: Commit

```bash
git add apps/api/src/grade_sight_api/routers/classes.py apps/api/tests/routers/test_classes_router.py
git commit -m "api: GET + PATCH /api/classes/{id} (detail with roster, edit + archive)"
```

---

## Task 4: Backend · member endpoints (`POST` + `DELETE`)

**Files:**
- Modify: `apps/api/src/grade_sight_api/routers/classes.py`
- Modify: `apps/api/tests/routers/test_classes_router.py`

### Step 1: Failing add-members tests

Append:

```python
@pytest.mark.asyncio
async def test_add_class_members_happy_path(async_session):
    teacher, org = await _seed_teacher(async_session)
    s1 = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="S1")
    s2 = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="S2")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([s1, s2, klass])
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/classes/{klass.id}/members",
                json={"student_ids": [str(s1.id), str(s2.id)]},
            )
        assert resp.status_code == 200
        names = [m["student_name"] for m in resp.json()["roster"]]
        assert sorted(names) == ["S1", "S2"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_add_class_members_idempotent(async_session):
    teacher, org = await _seed_teacher(async_session)
    s1 = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="S1")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([s1, klass])
    await async_session.flush()
    async_session.add(ClassMember(class_id=klass.id, student_id=s1.id, organization_id=org.id))
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/classes/{klass.id}/members",
                json={"student_ids": [str(s1.id)]},
            )
        assert resp.status_code == 200
        assert len(resp.json()["roster"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_add_class_members_cross_org_student_returns_404(async_session):
    teacher, org = await _seed_teacher(async_session)
    other_org = Organization(name="other")
    async_session.add(other_org)
    await async_session.flush()
    other_student = Student(
        organization_id=other_org.id, created_by_user_id=teacher.id, full_name="X"
    )
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([other_student, klass])
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/classes/{klass.id}/members",
                json={"student_ids": [str(other_student.id)]},
            )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_add_class_members_reenroll_after_left(async_session):
    teacher, org = await _seed_teacher(async_session)
    s1 = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="S1")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([s1, klass])
    await async_session.flush()
    async_session.add(ClassMember(
        class_id=klass.id, student_id=s1.id, organization_id=org.id,
        left_at=datetime(2026, 4, 1),
    ))
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/classes/{klass.id}/members",
                json={"student_ids": [str(s1.id)]},
            )
        assert resp.status_code == 200
        # Roster shows the student as active again
        assert len(resp.json()["roster"]) == 1
    finally:
        app.dependency_overrides.clear()
```

### Step 2: Run → fail

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k add_class_members`
Expected: 4 FAILS.

### Step 3: Implement `POST /api/classes/{id}/members`

Append to `routers/classes.py`:

```python
@router.post(
    "/api/classes/{class_id}/members",
    response_model=ClassDetailResponse,
)
async def add_class_members(
    class_id: UUID,
    payload: AddMembersRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassDetailResponse:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    if not payload.student_ids:
        return await _build_detail_response(klass, db)

    valid_ids_result = await db.execute(
        select(Student.id).where(
            Student.id.in_(payload.student_ids),
            Student.organization_id == user.organization_id,
            Student.deleted_at.is_(None),
        )
    )
    valid_ids = {row[0] for row in valid_ids_result.all()}

    invalid = set(payload.student_ids) - valid_ids
    if invalid:
        raise HTTPException(
            status_code=404,
            detail=f"Students not found: {sorted(str(i) for i in invalid)}",
        )

    existing_active = await db.execute(
        select(ClassMember.student_id).where(
            ClassMember.class_id == klass.id,
            ClassMember.student_id.in_(valid_ids),
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
    )
    already_active = {row[0] for row in existing_active.all()}

    for sid in valid_ids - already_active:
        db.add(ClassMember(
            class_id=klass.id,
            student_id=sid,
            organization_id=user.organization_id,
        ))
    await db.commit()

    return await _build_detail_response(klass, db)
```

### Step 4: Run → pass

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k add_class_members`
Expected: 4 PASS.

### Step 5: Failing remove-member tests

Append:

```python
@pytest.mark.asyncio
async def test_remove_class_member_sets_left_at(async_session):
    teacher, org = await _seed_teacher(async_session)
    s1 = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="S1")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([s1, klass])
    await async_session.flush()
    async_session.add(ClassMember(class_id=klass.id, student_id=s1.id, organization_id=org.id))
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/classes/{klass.id}/members/{s1.id}")
        assert resp.status_code == 204
        # Verify roster is empty after removal
        detail = await client.get(f"/api/classes/{klass.id}")
        assert detail.json()["roster"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_remove_class_member_404_if_not_active(async_session):
    teacher, org = await _seed_teacher(async_session)
    s1 = Student(organization_id=org.id, created_by_user_id=teacher.id, full_name="S1")
    klass = Klass(organization_id=org.id, teacher_id=teacher.id, name="K")
    async_session.add_all([s1, klass])
    await async_session.commit()

    _override_deps(async_session, teacher)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/classes/{klass.id}/members/{s1.id}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_remove_class_member_cross_teacher_returns_404(async_session):
    teacher_a, org = await _seed_teacher(async_session)
    teacher_b, _ = await _seed_teacher(async_session, org=org)
    s1 = Student(organization_id=org.id, created_by_user_id=teacher_b.id, full_name="S1")
    klass_b = Klass(organization_id=org.id, teacher_id=teacher_b.id, name="B's class")
    async_session.add_all([s1, klass_b])
    await async_session.flush()
    async_session.add(ClassMember(class_id=klass_b.id, student_id=s1.id, organization_id=org.id))
    await async_session.commit()

    _override_deps(async_session, teacher_a)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/classes/{klass_b.id}/members/{s1.id}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()
```

### Step 6: Run → fail

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v -k remove_class_member`
Expected: 3 FAILS.

### Step 7: Implement `DELETE /api/classes/{id}/members/{student_id}`

Append to `routers/classes.py`:

```python
@router.delete(
    "/api/classes/{class_id}/members/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_class_member(
    class_id: UUID,
    student_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    result = await db.execute(
        update(ClassMember)
        .where(
            ClassMember.class_id == klass.id,
            ClassMember.student_id == student_id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .values(left_at=datetime.now(timezone.utc).replace(tzinfo=None))
        .returning(ClassMember.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="student is not active in this class")

    await db.commit()
```

### Step 8: All ~23 backend tests pass + mypy clean

Run: `cd apps/api && uv run pytest tests/routers/test_classes_router.py -v`
Expected: ~23 PASS (the 16 from earlier + 7 new in this task — the ratio depends on exact count).

Run: `cd apps/api && uv run mypy src tests`
Expected: clean (no new errors; pre-existing mypy errors in unrelated files are acceptable).

### Step 9: Commit

```bash
git add apps/api/src/grade_sight_api/routers/classes.py apps/api/tests/routers/test_classes_router.py
git commit -m "api: POST + DELETE /api/classes/{id}/members (idempotent add, soft-remove via left_at)"
```

---

## Task 5: Frontend · lib changes (nav, types, api, actions)

**Files:**
- Modify: `apps/web/lib/nav.ts` (add "Classes" tab)
- Modify: `apps/web/lib/types.ts` (Klass, ClassDetail, ClassRosterMember)
- Modify: `apps/web/lib/api.ts` (fetchClasses, fetchClassDetail)
- Modify: `apps/web/lib/actions.ts` (4 server actions)

### Step 1: Add Classes tab to nav

Edit `apps/web/lib/nav.ts`:

```ts
export const TEACHER_TABS: AppHeaderTab[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Students", href: "/students" },
  { label: "Classes", href: "/classes" },
  { label: "Assessments", href: "/assessments" },
  { label: "Keys", href: "/keys" },
];
```

### Step 2: Add types

Edit `apps/web/lib/types.ts`. Add (alongside existing types):

```ts
export interface Klass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  archived: boolean;
  student_count: number;
  created_at: string;
}

export interface ClassListResponse {
  classes: Klass[];
  has_archived: boolean;
}

export interface ClassRosterMember {
  id: string;
  student_id: string;
  student_name: string;
  student_grade_level: string | null;
  joined_at: string;
}

export interface ClassDetail {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  archived: boolean;
  roster: ClassRosterMember[];
  created_at: string;
}
```

### Step 3: Add fetch helpers

Edit `apps/web/lib/api.ts`. Append:

```ts
// ---- Classes ----

export async function fetchClasses(opts?: {
  includeArchived?: boolean;
}): Promise<ClassListResponse> {
  const params = new URLSearchParams();
  if (opts?.includeArchived) params.set("include_archived", "true");
  const qs = params.toString();
  const url = `/api/classes${qs ? `?${qs}` : ""}`;
  const response = await authedFetch(url, { method: "GET" });
  if (response.status === 401 || response.status === 404) {
    return { classes: [], has_archived: false };
  }
  if (!response.ok) throw new Error(`GET /api/classes failed: ${response.status}`);
  return (await response.json()) as ClassListResponse;
}

export async function fetchClassDetail(id: string): Promise<ClassDetail | null> {
  const response = await authedFetch(`/api/classes/${id}`, { method: "GET" });
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /api/classes/${id} failed: ${response.status}`);
  return (await response.json()) as ClassDetail;
}
```

Add the `ClassListResponse` and `ClassDetail` types to whichever import block in `api.ts` is appropriate (the file should have an internal `import type { ... } from "./types"` block plus a public re-export block; add them to both, mirroring how `AnswerKey` is wired).

### Step 4: Add server actions

Edit `apps/web/lib/actions.ts`. Append:

```ts
export async function createClass(payload: {
  name: string;
  subject?: string | null;
  grade_level?: string | null;
}): Promise<{ id: string }> {
  const response = await callApi("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`POST /api/classes failed: ${response.status}`);
  }
  return (await response.json()) as { id: string };
}

export async function updateClass(
  id: string,
  payload: {
    name?: string;
    subject?: string | null;
    grade_level?: string | null;
    archived?: boolean;
  },
): Promise<void> {
  const response = await callApi(`/api/classes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`PATCH /api/classes/${id} failed: ${response.status}`);
  }
}

export async function addStudentsToClass(
  class_id: string,
  student_ids: string[],
): Promise<void> {
  const response = await callApi(`/api/classes/${class_id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/classes/${class_id}/members failed: ${response.status}`);
  }
}

export async function removeStudentFromClass(
  class_id: string,
  student_id: string,
): Promise<void> {
  const response = await callApi(
    `/api/classes/${class_id}/members/${student_id}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `DELETE /api/classes/${class_id}/members/${student_id} failed: ${response.status}`,
    );
  }
}
```

### Step 5: Verify gates

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean (only pre-existing warnings).

### Step 6: Commit

```bash
git add apps/web/lib/nav.ts apps/web/lib/types.ts apps/web/lib/api.ts apps/web/lib/actions.ts
git commit -m "web: add Classes nav tab + types + fetch helpers + 4 server actions"
```

---

## Task 6: Frontend · `<ClassFormDialog>` + tests

**Files:**
- Create: `apps/web/components/classes/class-form-dialog.tsx`
- Create: `apps/web/components/classes/class-form-dialog.test.tsx`

### Step 1: Create the component

```tsx
// apps/web/components/classes/class-form-dialog.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClass, updateClass } from "@/lib/actions";
import type { Klass } from "@/lib/types";

const SUBJECT_OPTIONS = [
  "Pre-Algebra", "Algebra 1", "Geometry", "Algebra 2",
  "Pre-Calculus", "Calculus", "Statistics", "Other…",
] as const;

export function ClassFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: Klass;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [isCustom, setIsCustom] = useState(
    initial?.subject != null && !(SUBJECT_OPTIONS as readonly string[]).includes(initial.subject),
  );
  const [gradeLevel, setGradeLevel] = useState(initial?.grade_level ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const trimmedName = name.trim();
  const trimmedSubject = subject.trim();
  const subjectInvalid = isCustom && trimmedSubject === "";
  const canSubmit = trimmedName !== "" && !subjectInvalid;

  function onSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const payload = {
          name: trimmedName,
          subject: trimmedSubject || null,
          grade_level: gradeLevel.trim() || null,
        };
        if (mode === "create") {
          const created = await createClass(payload);
          onOpenChange(false);
          router.push(`/classes/${created.id}`);
        } else if (initial) {
          await updateClass(initial.id, payload);
          onOpenChange(false);
          router.refresh();
        }
      } catch {
        toast.error("Couldn’t save the class — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New class" : "Edit class"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 4th period"
              className="rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Subject (optional)</span>
            <Select
              value={isCustom ? "Other…" : (subject || undefined)}
              onValueChange={(v) => {
                if (v === "Other…") {
                  setIsCustom(true);
                  setSubject("");
                } else {
                  setIsCustom(false);
                  setSubject(v);
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Pick a subject" /></SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustom && (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Algebra Zero Period"
                aria-label="Custom subject"
                className="mt-2 rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Grade level (optional)</span>
            <input
              type="text"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              placeholder="e.g., 9"
              className="rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || pending}
            onClick={onSubmit}
            className="rounded-[var(--radius-sm)] bg-ink px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : mode === "create" ? "Create class" : "Save changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 2: Create the test file

```tsx
// apps/web/components/classes/class-form-dialog.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ClassFormDialog } from "./class-form-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/actions", () => ({
  createClass: (...args: unknown[]) => mockCreate(...args),
  updateClass: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("ClassFormDialog", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockUpdate.mockReset();
  });

  it("disables submit until name has content", async () => {
    render(<ClassFormDialog open onOpenChange={() => {}} mode="create" />);
    const submit = screen.getByRole("button", { name: /create class/i });
    expect(submit).toBeDisabled();

    const nameInput = screen.getByPlaceholderText(/4th period/i);
    await userEvent.type(nameInput, "Period 4");
    expect(submit).toBeEnabled();
  });

  it("reveals custom subject input when 'Other…' is selected and gates submit on it", async () => {
    render(<ClassFormDialog open onOpenChange={() => {}} mode="create" />);
    await userEvent.type(screen.getByPlaceholderText(/4th period/i), "Period 4");

    // Open the Subject select; click "Other…"
    const subjectTrigger = screen.getByRole("combobox");
    await userEvent.click(subjectTrigger);
    await userEvent.click(screen.getByText("Other…"));

    // Custom subject input appears, but is empty → submit disabled
    const customInput = screen.getByLabelText(/custom subject/i);
    expect(customInput).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /create class/i });
    expect(submit).toBeDisabled();

    await userEvent.type(customInput, "Algebra Zero");
    expect(submit).toBeEnabled();
  });

  it("calls createClass with the form values", async () => {
    mockCreate.mockResolvedValue({ id: "new-id" });
    render(<ClassFormDialog open onOpenChange={() => {}} mode="create" />);
    await userEvent.type(screen.getByPlaceholderText(/4th period/i), "Period 4");
    await userEvent.click(screen.getByRole("button", { name: /create class/i }));

    expect(mockCreate).toHaveBeenCalledWith({
      name: "Period 4",
      subject: null,
      grade_level: null,
    });
  });

  it("pre-fills fields in edit mode", async () => {
    render(
      <ClassFormDialog
        open
        onOpenChange={() => {}}
        mode="edit"
        initial={{
          id: "existing",
          name: "Old name",
          subject: "Algebra 1",
          grade_level: "9",
          archived: false,
          student_count: 2,
          created_at: "2026-04-01T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByDisplayValue("Old name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9")).toBeInTheDocument();
  });
});
```

### Step 3: Run tests + verify gates

Run: `cd apps/web && pnpm vitest run class-form-dialog`
Expected: 4 PASS.

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

### Step 4: Commit

```bash
git add apps/web/components/classes/class-form-dialog.tsx apps/web/components/classes/class-form-dialog.test.tsx
git commit -m "web: ClassFormDialog (create + edit) with subject Other… reveal + tests"
```

---

## Task 7: Frontend · `/classes` list page (components + integration)

**Files:**
- Create: `apps/web/components/classes/new-class-button.tsx`
- Create: `apps/web/components/classes/archived-toggle.tsx`
- Create: `apps/web/components/classes/class-list-header.tsx`
- Create: `apps/web/components/classes/class-row.tsx`
- Create: `apps/web/components/classes/class-list.tsx`
- Create: `apps/web/components/classes/empty-class-list.tsx`
- Create: `apps/web/app/classes/page.tsx`

### Step 1: `new-class-button.tsx`

```tsx
"use client";
import { useState } from "react";
import { ClassFormDialog } from "./class-form-dialog";

export function NewClassButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] bg-ink px-5 py-2.5 text-sm text-paper hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        New class
      </button>
      <ClassFormDialog open={open} onOpenChange={setOpen} mode="create" />
    </>
  );
}
```

### Step 2: `archived-toggle.tsx`

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function ArchivedToggle({ includeArchived }: { includeArchived: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(sp.toString());
    if (includeArchived) params.delete("include_archived");
    else params.set("include_archived", "true");
    const qs = params.toString();
    router.push(`/classes${qs ? "?" + qs : ""}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-ink"
    >
      {includeArchived ? "Hide archived" : "Show archived"}
    </button>
  );
}
```

### Step 3: `class-list-header.tsx`

```tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { NewClassButton } from "./new-class-button";
import { ArchivedToggle } from "./archived-toggle";

export function ClassListHeader({
  hasArchived,
  includeArchived,
}: {
  hasArchived: boolean;
  includeArchived: boolean;
}) {
  return (
    <header className="mb-10 flex items-end justify-between">
      <div>
        <SectionEyebrow>Roster</SectionEyebrow>
        <div className="mt-3">
          <SerifHeadline level="page" as="h1">Classes</SerifHeadline>
        </div>
        <p className="mt-2 text-base text-ink-soft max-w-[640px]">
          Group your students into classes — Algebra 1 4th period, etc.
        </p>
      </div>
      <div className="flex items-baseline gap-5">
        {hasArchived && <ArchivedToggle includeArchived={includeArchived} />}
        <NewClassButton />
      </div>
    </header>
  );
}
```

### Step 4: `class-row.tsx`

```tsx
import Link from "next/link";
import type { Klass } from "@/lib/types";

export function ClassRow({ klass }: { klass: Klass }) {
  const href = `/classes/${klass.id}`;
  const archivedClass = klass.archived ? "opacity-60" : "";
  return (
    <tr className={`border-t border-rule-soft hover:bg-paper-soft ${archivedClass}`}>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pl-4 pr-4 font-serif text-base text-ink line-clamp-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {klass.name}
          {klass.archived && (
            <span className="ml-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">archived</span>
          )}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-serif text-base text-ink-soft">
          {klass.subject ?? "—"}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {klass.grade_level ?? "—"}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {klass.student_count}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 text-right font-mono text-xs uppercase tracking-[0.1em] text-accent" aria-hidden="true">
          ›
        </Link>
      </td>
    </tr>
  );
}
```

### Step 5: `class-list.tsx`

```tsx
import type { Klass } from "@/lib/types";
import { ClassRow } from "./class-row";

export function ClassList({ classes }: { classes: Klass[] }) {
  if (classes.length === 0) {
    return (
      <p className="py-12 text-center text-base text-ink-soft">
        No classes match.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
      <table className="w-full text-left">
        <thead className="border-b border-rule-soft bg-paper-soft">
          <tr className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            <th className="py-3 pl-4 pr-4 font-normal">Name</th>
            <th className="py-3 pr-4 font-normal">Subject</th>
            <th className="py-3 pr-4 font-normal">Grade</th>
            <th className="py-3 pr-4 font-normal">Students</th>
            <th className="py-3 pr-4" />
          </tr>
        </thead>
        <tbody>
          {classes.map((k) => <ClassRow key={k.id} klass={k} />)}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 6: `empty-class-list.tsx`

```tsx
import { NewClassButton } from "./new-class-button";

export function EmptyClassList() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="mb-6 text-base text-ink-soft">
        No classes yet. Create your first one.
      </p>
      <NewClassButton />
    </div>
  );
}
```

### Step 7: `/classes/page.tsx`

```tsx
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchClasses, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { ClassListHeader } from "@/components/classes/class-list-header";
import { ClassList } from "@/components/classes/class-list";
import { EmptyClassList } from "@/components/classes/empty-class-list";

interface PageProps {
  searchParams: Promise<{ include_archived?: string }>;
}

export default async function ClassesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const includeArchived = params.include_archived === "true";

  const [user, list] = await Promise.all([
    fetchMe(),
    fetchClasses({ includeArchived }),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  const isFirstRunEmpty = !includeArchived && list.classes.length === 0;

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/classes"
      uploadHref="/upload"
    >
      <PageContainer>
        <ClassListHeader hasArchived={list.has_archived} includeArchived={includeArchived} />
        {isFirstRunEmpty ? <EmptyClassList /> : <ClassList classes={list.classes} />}
      </PageContainer>
    </AppShell>
  );
}
```

### Step 8: Verify build

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: PASS, `/classes` route in build output.

### Step 9: Commit

```bash
git add apps/web/components/classes/ apps/web/app/classes/page.tsx
git commit -m "web: /classes list page (table + new-class button + archived toggle + empty state)"
```

---

## Task 8: Frontend · `/classes/[id]` detail page (components + integration)

**Files:**
- Create: `apps/web/components/classes/class-detail-header.tsx`
- Create: `apps/web/components/classes/edit-class-button.tsx`
- Create: `apps/web/components/classes/archive-class-button.tsx`
- Create: `apps/web/components/classes/unarchive-class-button.tsx`
- Create: `apps/web/components/classes/add-students-dialog.tsx`
- Create: `apps/web/components/classes/add-students-button.tsx`
- Create: `apps/web/components/classes/remove-student-button.tsx`
- Create: `apps/web/components/classes/roster-list.tsx`
- Create: `apps/web/components/classes/roster-section.tsx`
- Create: `apps/web/components/classes/add-students-dialog.test.tsx`
- Create: `apps/web/app/classes/[id]/page.tsx`

### Step 1: `add-students-dialog.tsx`

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addStudentsToClass } from "@/lib/actions";
import type { Student } from "@/lib/types";

export function AddStudentsDialog({
  open,
  onOpenChange,
  classId,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  candidates: Student[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function onSubmit() {
    if (selected.size === 0) return;
    startTransition(async () => {
      try {
        await addStudentsToClass(classId, Array.from(selected));
        onOpenChange(false);
        setSelected(new Set());
        router.refresh();
      } catch {
        toast.error("Couldn’t add students — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add students to this class</DialogTitle>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-ink-soft">
            All your students are already in this class.{" "}
            <Link href="/students" className="text-accent underline">Create a new student</Link>
            {" "}to add them here.
          </p>
        ) : (
          <ul className="max-h-[320px] overflow-y-auto divide-y divide-rule-soft border-y border-rule-soft">
            {candidates.map((s) => (
              <li key={s.id}>
                <label className="flex items-baseline gap-3 py-3 hover:bg-paper-soft -mx-2 px-2 rounded-[var(--radius-sm)]">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    aria-label={s.full_name}
                  />
                  <span className="text-base text-ink">{s.full_name}</span>
                  {s.grade_level != null && (
                    <span className="ml-auto font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                      Grade {s.grade_level}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || pending}
            onClick={onSubmit}
            className="rounded-[var(--radius-sm)] bg-ink px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Adding…" : `Add ${selected.size} ${selected.size === 1 ? "student" : "students"}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 2: `add-students-dialog.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AddStudentsDialog } from "./add-students-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockAdd = vi.fn();
vi.mock("@/lib/actions", () => ({
  addStudentsToClass: (...args: unknown[]) => mockAdd(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const candidates = [
  { id: "s1", full_name: "Marcus Reilly", grade_level: 9, created_at: "2026-04-01T00:00:00Z" },
  { id: "s2", full_name: "Jordan Park", grade_level: 9, created_at: "2026-04-01T00:00:00Z" },
];

describe("AddStudentsDialog", () => {
  beforeEach(() => mockAdd.mockReset());

  it("renders candidate students", () => {
    render(
      <AddStudentsDialog open onOpenChange={() => {}} classId="c1" candidates={candidates} />,
    );
    expect(screen.getByText("Marcus Reilly")).toBeInTheDocument();
    expect(screen.getByText("Jordan Park")).toBeInTheDocument();
  });

  it("disables submit until at least one is selected", async () => {
    render(
      <AddStudentsDialog open onOpenChange={() => {}} classId="c1" candidates={candidates} />,
    );
    const submit = screen.getByRole("button", { name: /add 0 students/i });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Marcus Reilly"));
    expect(screen.getByRole("button", { name: /add 1 student/i })).toBeEnabled();
  });

  it("shows the create-a-student link when no candidates", () => {
    render(
      <AddStudentsDialog open onOpenChange={() => {}} classId="c1" candidates={[]} />,
    );
    expect(screen.getByText(/already in this class/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a new student/i })).toBeInTheDocument();
  });
});
```

### Step 3: `add-students-button.tsx`

```tsx
"use client";
import { useState } from "react";
import { AddStudentsDialog } from "./add-students-dialog";
import type { Student } from "@/lib/types";

export function AddStudentsButton({
  classId,
  candidates,
}: {
  classId: string;
  candidates: Student[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] bg-ink px-5 py-2.5 text-sm text-paper hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Add students
      </button>
      <AddStudentsDialog open={open} onOpenChange={setOpen} classId={classId} candidates={candidates} />
    </>
  );
}
```

### Step 4: `remove-student-button.tsx`

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeStudentFromClass } from "@/lib/actions";

export function RemoveStudentButton({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!window.confirm(`Remove ${studentName} from this class?`)) return;
    startTransition(async () => {
      try {
        await removeStudentFromClass(classId, studentId);
        router.refresh();
      } catch {
        toast.error("Couldn’t remove the student — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-mark disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
```

### Step 5: `roster-list.tsx`

```tsx
import type { ClassRosterMember } from "@/lib/types";
import { RemoveStudentButton } from "./remove-student-button";

export function RosterList({
  classId,
  roster,
  archived,
}: {
  classId: string;
  roster: ClassRosterMember[];
  archived: boolean;
}) {
  if (roster.length === 0) {
    return (
      <p className="py-8 text-base text-ink-soft">No students yet — add your first.</p>
    );
  }
  return (
    <ul className="divide-y divide-rule-soft border-y border-rule-soft">
      {roster.map((m) => (
        <li key={m.id} className="flex items-baseline justify-between gap-4 py-3">
          <span className="font-serif text-base text-ink">{m.student_name}</span>
          <span className="flex items-baseline gap-4">
            {m.student_grade_level != null && (
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                Grade {m.student_grade_level}
              </span>
            )}
            {!archived && (
              <RemoveStudentButton
                classId={classId}
                studentId={m.student_id}
                studentName={m.student_name}
              />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

### Step 6: `roster-section.tsx`

```tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { AddStudentsButton } from "./add-students-button";
import { RosterList } from "./roster-list";
import type { ClassDetail, Student } from "@/lib/types";

export function RosterSection({
  klass,
  candidateStudents,
}: {
  klass: ClassDetail;
  candidateStudents: Student[];
}) {
  return (
    <section className="mt-12">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <SectionEyebrow>Roster</SectionEyebrow>
          <div className="mt-3">
            <SerifHeadline level="section" as="h2">
              {klass.roster.length} {klass.roster.length === 1 ? "student" : "students"}
            </SerifHeadline>
          </div>
        </div>
        {!klass.archived && (
          <AddStudentsButton classId={klass.id} candidates={candidateStudents} />
        )}
      </header>
      <RosterList classId={klass.id} roster={klass.roster} archived={klass.archived} />
    </section>
  );
}
```

### Step 7: Edit / Archive / Unarchive buttons

`edit-class-button.tsx`:

```tsx
"use client";
import { useState } from "react";
import { ClassFormDialog } from "./class-form-dialog";
import type { Klass } from "@/lib/types";

export function EditClassButton({ klass }: { klass: Klass }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
      >
        Edit
      </button>
      <ClassFormDialog open={open} onOpenChange={setOpen} mode="edit" initial={klass} />
    </>
  );
}
```

`archive-class-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateClass } from "@/lib/actions";

export function ArchiveClassButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!window.confirm("Archive this class? You can restore it later.")) return;
    startTransition(async () => {
      try {
        await updateClass(classId, { archived: true });
        router.push("/classes");
      } catch {
        toast.error("Couldn’t archive the class — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-[var(--radius-sm)] border border-mark px-4 py-2 text-sm text-mark hover:bg-mark hover:text-paper disabled:opacity-50"
    >
      {pending ? "Archiving…" : "Archive"}
    </button>
  );
}
```

`unarchive-class-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateClass } from "@/lib/actions";

export function UnarchiveClassButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      try {
        await updateClass(classId, { archived: false });
        router.refresh();
      } catch {
        toast.error("Couldn’t unarchive — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-[var(--radius-sm)] bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
    >
      {pending ? "Restoring…" : "Unarchive"}
    </button>
  );
}
```

### Step 8: `class-detail-header.tsx`

```tsx
import Link from "next/link";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { EditClassButton } from "./edit-class-button";
import { ArchiveClassButton } from "./archive-class-button";
import { UnarchiveClassButton } from "./unarchive-class-button";
import type { ClassDetail } from "@/lib/types";

export function ClassDetailHeader({ klass }: { klass: ClassDetail }) {
  const subhead = [klass.subject, klass.grade_level && `Grade ${klass.grade_level}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Link
        href="/classes"
        className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-ink"
      >
        ← Classes
      </Link>
      <header className="mt-6 mb-10 flex items-end justify-between">
        <div>
          <SectionEyebrow>{klass.archived ? "Class · Archived" : "Class"}</SectionEyebrow>
          <div className="mt-3">
            <SerifHeadline level="page" as="h1">{klass.name}</SerifHeadline>
          </div>
          {subhead && (
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-mute">
              {subhead}
            </p>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          {klass.archived ? (
            <UnarchiveClassButton classId={klass.id} />
          ) : (
            <>
              <EditClassButton klass={{ ...klass, student_count: klass.roster.length }} />
              <ArchiveClassButton classId={klass.id} />
            </>
          )}
        </div>
      </header>
    </>
  );
}
```

### Step 9: `/classes/[id]/page.tsx`

```tsx
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchClassDetail, fetchMe, fetchStudents } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { ClassDetailHeader } from "@/components/classes/class-detail-header";
import { RosterSection } from "@/components/classes/roster-section";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail, allStudents] = await Promise.all([
    fetchMe(),
    fetchClassDetail(id),
    fetchStudents(),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();
  if (detail === null) notFound();

  const enrolledIds = new Set(detail.roster.map((m) => m.student_id));
  const candidateStudents = allStudents.filter((s) => !enrolledIds.has(s.id));

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/classes"
      uploadHref="/upload"
    >
      <PageContainer className="max-w-[1000px]">
        <ClassDetailHeader klass={detail} />
        <RosterSection klass={detail} candidateStudents={candidateStudents} />
      </PageContainer>
    </AppShell>
  );
}
```

### Step 10: Run dialog tests + verify gates

Run: `cd apps/web && pnpm vitest run add-students-dialog`
Expected: 3 PASS.

Run: `cd apps/web && pnpm typecheck && pnpm lint && pnpm build`
Expected: clean; both `/classes` and `/classes/[id]` routes in build output.

### Step 11: Commit

```bash
git add apps/web/components/classes/ apps/web/app/classes/
git commit -m "web: /classes/[id] detail page (header + roster + edit/archive/unarchive + add-students dialog)"
```

---

## Task 9: Manual visual verification + final whole-branch review (Opus)

**Goal:** Walk the full class flow in the browser, then dispatch the Opus reviewer.

- [ ] **Step 1: Start the dev servers**

```bash
cd apps/api && uv run uvicorn grade_sight_api.main:app --reload
# parallel terminal:
cd apps/web && pnpm dev
```

- [ ] **Step 2: Walk the flow as a teacher**

1. Tab to `/classes` → empty state on first visit
2. Click "New class" → dialog → name "Period 4" + Subject "Algebra 1" + Grade "9" → save → redirect to detail page
3. Detail page: empty roster + "Add students" button + Edit + Archive
4. "Add students" → dialog with all teacher's students → select 3 → save → roster shows them
5. "Remove" on a roster row → confirm → student gone
6. "Edit" → rename → save → header updates
7. "Archive" → confirm → redirect to `/classes`, class disappears
8. "Show archived" → archived class re-appears with archived treatment
9. Click archived class → detail page shows "Unarchive" only (no Edit / Archive / Add / Remove)
10. "Unarchive" → page becomes editable again
11. Test "Other…" subject: edit → pick "Other…" → custom input appears → enter "Algebra Zero Period" → save → header subhead reads "Algebra Zero Period · Grade 9"

- [ ] **Step 3: Walk auth gates**

1. As parent, type `/classes` → 404
2. As teacher A, type `/classes/[teacher-B-class-id]` → 404 (assuming you can seed two teachers in one org)

- [ ] **Step 4: Stop the servers**

Ctrl-C both. No commit needed for this task.

- [ ] **Step 5: Run all gates one more time**

```bash
cd apps/api && uv run pytest && uv run mypy src tests
cd apps/web && pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Expected: ALL PASS.

- [ ] **Step 6: Dispatch final whole-branch reviewer (Opus)**

Use `superpowers:code-reviewer` agent with Opus model. Provide:
- BASE_SHA: `c7ee830` (spec commit, just before implementation tasks)
- HEAD_SHA: current
- Spec + plan paths
- Cross-cutting concerns: cross-org and cross-teacher isolation across all 6 endpoints, idempotency on member-add, archive/unarchive symmetry, dialog UX, "Other…" subject path, candidate-student filtering on the detail page, the back-link consistency.

- [ ] **Step 7: Address Critical / Important findings**

Per workflow: fix Critical + Important; accept Nits.

---

## Task 10: Open PR + squash-merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin step-13c-class-flow
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base main --head step-13c-class-flow --title "Step 13c · Teacher class flow" --body "$(cat <<'EOF'
## Summary

- New `/classes` (table list with Show-archived toggle) and `/classes/[id]` (header + roster + edit/archive/unarchive + add-students dialog).
- Six endpoints under `/api/classes` for create/list/detail/edit/archive + add/remove members. All teacher-only and scoped by `(organization_id, teacher_id)`.
- New "Classes" tab in `TEACHER_TABS` (between Students and Assessments).
- Subject is a dropdown of common math courses with "Other…" write-in fallback.
- Schema was already in place from Spec 2 — this step adds the application layer only. No migrations.

## Architecture

- No service layer for classes — CRUD logic lives in the router. Only ~250 lines including helpers.
- `_get_class_or_404` is the single source of cross-teacher / cross-org enforcement.
- Member add is idempotent (re-adding an active member is a no-op). Re-enrolling a student who has `left_at` set creates a new active row, leaving the historical row in place.
- Archive = soft-delete (`deleted_at`); unarchive clears it. UI shows read-only mode for archived classes.

## Followups captured

Bulk-paste roster import, class context in `/upload`, `Class` column on `/assessments` archive, "Show left students" on roster, backend gate on archived-class member ops.

## Test plan

- [x] Backend: ~23 router tests + mypy clean
- [x] Frontend: typecheck + lint + vitest (4 ClassFormDialog + 3 AddStudentsDialog) + build clean
- [x] Manual: full flow walked — create, edit, add students, remove students, archive, unarchive, "Other…" subject, parent → 404, cross-teacher → 404

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After David's affirmative on the PR, squash-merge**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only
```

Per workflow memory: an affirmative IS the merge cue. Don't ask again.

---

## Notes for the implementer

- **Subject field's "Other…" string never reaches the backend.** The dialog's submit handler sends the actual `subject` state — which is the dropdown value when not custom, the write-in text when custom. The literal string "Other…" is a UI-only sentinel.
- **Multi-teacher orgs aren't a v1 concern.** The cross-teacher 404 enforcement still works, but real multi-teacher org workflows (e.g., admin transfer) are a separate problem captured in Step 13b's followups.
- **Cascade interaction with Step 13b's `account_deletion_service`.** When a teacher self-deletes, the cascade in `account_deletion_service.py` already soft-deletes Klass and ClassMember rows for that teacher's org. Don't add anything here; it's already wired.
- **`Student.created_by_user_id` exists** (used as the parent-cascade scope in Step 13b) — for class member tests, you reference it when seeding students. For Assessment + AnswerKey tests it would be `uploaded_by_user_id`, but those are out of scope here.
- **The shadcn `<Select>`'s open/close in vitest tests** — `userEvent.click(screen.getByRole("combobox"))` opens it; the option items render in a Portal but Testing Library still finds them. Same pattern as Step 13a's archive-filters tests.
