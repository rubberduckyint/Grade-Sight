# Assessment Upload UI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest end-to-end upload flow for the prototype: a teacher can sign in, manage a roster of students on `/students`, upload a quiz photo via `/upload`, and see the recent uploads on `/dashboard`. No diagnostic engine yet — uploads stay in `pending` status until a future spec.

**Architecture:** Two new backend routers (`students.py`, `assessments.py`) producing four endpoints; existing `storage_service.get_upload_url` from Spec 5 generates presigned R2 PUT URLs; browser uploads directly to R2 (FastAPI not in upload path); tenant-scoped by `organization_id`. Three frontend pages (`/upload` new, `/students` new, `/dashboard` updated) with four new components.

**Tech Stack:** Next.js 16 (App Router), Tailwind 4, shadcn/ui, Clerk, Python 3.12 + FastAPI, SQLAlchemy 2 async, Pydantic, asyncpg. Existing storage layer uses `aioboto3` against Cloudflare R2.

---

## Reference Documents

- `docs/superpowers/specs/2026-04-26-assessment-upload-shell-design.md` — the spec
- `apps/api/src/grade_sight_api/routers/me.py` — pattern for routers using `get_current_user`
- `apps/api/src/grade_sight_api/services/storage_service.py` — `get_upload_url` API
- `apps/api/src/grade_sight_api/models/{assessment.py,student.py}` — existing models
- `apps/api/tests/services/test_storage_get_upload_url.py` — pattern for mocking `storage_service`
- `apps/web/lib/api.ts` — pattern for `authedFetch`-based helpers
- `apps/web/app/dashboard/page.tsx` — pattern for `AppShell` + `PageContainer` + Editorial components

## Pre-merge checklist (every task)

1. `cd apps/api && ~/.local/bin/uv run ruff check` — clean
2. `cd apps/api && ~/.local/bin/uv run mypy src tests` — clean
3. `cd apps/api && ~/.local/bin/uv run pytest -q` — all default tests pass
4. `cd apps/web && pnpm lint && pnpm typecheck` — clean (frontend tasks)
5. Commit message: imperative subject, body explaining *why*, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 1: Backend — students endpoints

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/students.py`
- Create: `apps/api/src/grade_sight_api/routers/students.py`
- Modify: `apps/api/src/grade_sight_api/main.py` (register router)
- Create: `apps/api/tests/routers/__init__.py` (empty if missing)
- Create: `apps/api/tests/routers/test_students_router.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/routers/__init__.py` (zero bytes) if it doesn't already exist.

Create `apps/api/tests/routers/test_students_router.py`:

```python
"""Tests for the students router (POST/GET /api/students)."""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.main import app
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_user(session: AsyncSession, *, org_id=None) -> User:
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


async def test_create_persists_with_org_id(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)

    with (
        patch(
            "grade_sight_api.auth.dependencies.get_current_user",
            return_value=user,
        ),
        patch(
            "grade_sight_api.db.get_session",
            return_value=async_session,
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.post(
                "/api/students",
                json={"full_name": "Ada Lovelace"},
                headers={"Authorization": "Bearer fake"},
            )

    assert r.status_code == 201
    body = r.json()
    assert body["full_name"] == "Ada Lovelace"

    rows = (await async_session.execute(select(Student))).scalars().all()
    assert len(rows) == 1
    assert rows[0].organization_id == user.organization_id
    assert rows[0].created_by_user_id == user.id


async def test_create_rejects_empty_full_name(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)

    with (
        patch(
            "grade_sight_api.auth.dependencies.get_current_user",
            return_value=user,
        ),
        patch(
            "grade_sight_api.db.get_session",
            return_value=async_session,
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.post(
                "/api/students",
                json={"full_name": ""},
                headers={"Authorization": "Bearer fake"},
            )

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

    with (
        patch(
            "grade_sight_api.auth.dependencies.get_current_user",
            return_value=user_a,
        ),
        patch(
            "grade_sight_api.db.get_session",
            return_value=async_session,
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.get(
                "/api/students",
                headers={"Authorization": "Bearer fake"},
            )

    assert r.status_code == 200
    body = r.json()
    names = [s["full_name"] for s in body["students"]]
    assert names == ["Student A"]
```

The test uses `patch("grade_sight_api.auth.dependencies.get_current_user", ...)` to bypass the real Clerk JWT verification and the lazy upsert path. This is how every other authenticated test in this codebase fakes auth (see `tests/auth/test_lazy_upsert_cleanup.py` for prior art).

The `patch("grade_sight_api.db.get_session", ...)` pattern bypasses the FastAPI Depends machinery so the test session (with SAVEPOINT rollback from conftest) is what the route actually receives. If this pattern doesn't work in practice (Depends with patches can be finicky), use FastAPI's `app.dependency_overrides[get_session] = lambda: async_session` pattern instead.

- [ ] **Step 2: Run tests, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_students_router.py -v
```

Expected: 3 tests FAIL with `404 Not Found` or `ImportError` (router doesn't exist yet).

- [ ] **Step 3: Implement schemas**

Create `apps/api/src/grade_sight_api/schemas/students.py`:

```python
"""Pydantic schemas for the students router."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=1)
    date_of_birth: date | None = None


class StudentResponse(BaseModel):
    id: UUID
    full_name: str
    date_of_birth: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentListResponse(BaseModel):
    students: list[StudentResponse]
```

- [ ] **Step 4: Implement router**

Create `apps/api/src/grade_sight_api/routers/students.py`:

```python
"""Students router — list and create students for the authenticated user's org."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.student import Student
from ..models.user import User
from ..schemas.students import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
)

router = APIRouter()


@router.get("/api/students", response_model=StudentListResponse)
async def list_students(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentListResponse:
    """List students belonging to the authenticated user's organization."""
    result = await db.execute(
        select(Student)
        .where(
            Student.organization_id == user.organization_id,
            Student.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    students = result.scalars().all()
    return StudentListResponse(
        students=[StudentResponse.model_validate(s) for s in students]
    )


@router.post(
    "/api/students",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student(
    payload: StudentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentResponse:
    """Create a student under the authenticated user's organization."""
    if not payload.full_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="full_name is required",
        )

    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name=payload.full_name.strip(),
        date_of_birth=payload.date_of_birth,
    )
    db.add(student)
    await db.flush()
    return StudentResponse.model_validate(student)
```

- [ ] **Step 5: Register router in `main.py`**

Modify `apps/api/src/grade_sight_api/main.py`. Add the import (alphabetically with existing routers) and the `include_router` call:

```python
from .routers import billing as billing_router
from .routers import me as me_router
from .routers import students as students_router  # NEW
from .routers.webhooks import stripe as stripe_webhook_router
```

```python
app.include_router(me_router.router)
app.include_router(billing_router.router)
app.include_router(students_router.router)  # NEW
app.include_router(stripe_webhook_router.router)
```

Also add the new router to the existing `B008` exemption list in `pyproject.toml` (the routers all use `Depends(...)` in defaults which `B008` flags). Open `apps/api/pyproject.toml` and find the `[tool.ruff.lint.per-file-ignores]` block. Add this line in alphabetical order:

```toml
"src/grade_sight_api/routers/students.py" = ["B008"]
```

- [ ] **Step 6: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_students_router.py -v
```

Expected: 3 PASSED.

If tests fail with "Depends + patch" issues, switch the test setup to use `app.dependency_overrides`:

```python
from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session

app.dependency_overrides[get_current_user] = lambda: user
app.dependency_overrides[get_session] = lambda: async_session
try:
    async with AsyncClient(...) as client:
        ...
finally:
    app.dependency_overrides.clear()
```

- [ ] **Step 7: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total tests: 44 passed (41 from before + 3 new), 2 skipped.

- [ ] **Step 8: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/schemas/students.py apps/api/src/grade_sight_api/routers/students.py apps/api/src/grade_sight_api/main.py apps/api/pyproject.toml apps/api/tests/routers/__init__.py apps/api/tests/routers/test_students_router.py
git commit -m "$(cat <<'EOF'
Add students router (GET, POST /api/students)

Two endpoints scoped to the authenticated user's organization. POST
validates full_name is non-empty, sets created_by_user_id and
organization_id from the session. GET returns the list ordered by
full_name with deleted_at filtering.

Three unit tests cover: persistence with org_id, empty-name rejection,
and tenant scoping on the list endpoint. Tests use Depends-overrides
to inject the authenticated user + DB session bypassing real Clerk
JWT verification.

Foundation for the assessment upload spec — assessments require a
student_id and need a roster to pick from.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend — assessments endpoints

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/assessments.py`
- Create: `apps/api/src/grade_sight_api/routers/assessments.py`
- Modify: `apps/api/src/grade_sight_api/main.py`
- Modify: `apps/api/pyproject.toml` (B008 exemption)
- Create: `apps/api/tests/routers/test_assessments_router.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/routers/test_assessments_router.py`:

```python
"""Tests for the assessments router (POST/GET /api/assessments)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
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


async def _seed_user(session: AsyncSession, *, org_id=None) -> User:
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


async def _seed_student(session: AsyncSession, user: User, name: str = "Test Student") -> Student:
    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name=name,
    )
    session.add(student)
    await session.flush()
    return student


async def test_create_persists_pending_row(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session

    fake_url = "https://r2.example/upload?sig=abc"
    try:
        with patch(
            "grade_sight_api.routers.assessments.storage_service.get_upload_url",
            new=AsyncMock(return_value=fake_url),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
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
    assert a.s3_url.startswith(f"assessments/{user.organization_id}/{student.id}/")


async def test_create_rejects_cross_org_student(async_session: AsyncSession) -> None:
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    async_session.add(org_a)
    async_session.add(org_b)
    await async_session.flush()

    user_a = await _seed_user(async_session, org_id=org_a.id)
    user_b = await _seed_user(async_session, org_id=org_b.id)
    student_b = await _seed_student(async_session, user_b)

    app.dependency_overrides[get_current_user] = lambda: user_a
    app.dependency_overrides[get_session] = lambda: async_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
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


async def test_create_rejects_non_image_content_type(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
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

    app.dependency_overrides[get_current_user] = lambda: user_a
    app.dependency_overrides[get_session] = lambda: async_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
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
```

- [ ] **Step 2: Run, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_assessments_router.py -v
```

Expected: 4 FAIL with import errors / 404 (router doesn't exist).

- [ ] **Step 3: Implement schemas**

Create `apps/api/src/grade_sight_api/schemas/assessments.py`:

```python
"""Pydantic schemas for the assessments router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from ..models.assessment import AssessmentStatus


class AssessmentCreateRequest(BaseModel):
    student_id: UUID
    original_filename: str
    content_type: str


class AssessmentCreateResponse(BaseModel):
    assessment_id: UUID
    upload_url: str
    key: str


class AssessmentListItem(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    original_filename: str
    status: AssessmentStatus
    uploaded_at: datetime


class AssessmentListResponse(BaseModel):
    assessments: list[AssessmentListItem]
```

- [ ] **Step 4: Implement router**

Create `apps/api/src/grade_sight_api/routers/assessments.py`:

```python
"""Assessments router — list and create assessments for the authenticated user's org.

POST /api/assessments creates the assessment row in `pending` status AND returns
a presigned R2 PUT URL the browser uses to upload the file directly. Single
endpoint by design (see spec).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.assessment import Assessment, AssessmentStatus
from ..models.student import Student
from ..models.user import User
from ..schemas.assessments import (
    AssessmentCreateRequest,
    AssessmentCreateResponse,
    AssessmentListItem,
    AssessmentListResponse,
)
from ..services import storage_service
from ..services.call_context import CallContext

router = APIRouter()


def _safe_extension(filename: str) -> str:
    """Lowercase file extension without the dot, defaulting to 'bin'."""
    suffix = Path(filename).suffix.lstrip(".").lower()
    return suffix or "bin"


@router.get("/api/assessments", response_model=AssessmentListResponse)
async def list_assessments(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentListResponse:
    """List recent assessments for the authenticated user's organization, joined with student name."""
    result = await db.execute(
        select(Assessment, Student.full_name)
        .join(Student, Assessment.student_id == Student.id)
        .where(
            Assessment.organization_id == user.organization_id,
            Assessment.deleted_at.is_(None),
        )
        .order_by(Assessment.uploaded_at.desc())
        .limit(limit)
    )
    items: list[AssessmentListItem] = []
    for assessment, student_name in result.all():
        items.append(
            AssessmentListItem(
                id=assessment.id,
                student_id=assessment.student_id,
                student_name=student_name,
                original_filename=assessment.original_filename,
                status=assessment.status,
                uploaded_at=assessment.uploaded_at,
            )
        )
    return AssessmentListResponse(assessments=items)


@router.post(
    "/api/assessments",
    response_model=AssessmentCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assessment(
    payload: AssessmentCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentCreateResponse:
    """Create a pending assessment row and return a presigned R2 PUT URL."""
    if not payload.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="content_type must be an image/* type",
        )
    if not payload.original_filename.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="original_filename is required",
        )

    # Look up the student and verify it belongs to the user's org
    result = await db.execute(
        select(Student).where(
            Student.id == payload.student_id,
            Student.deleted_at.is_(None),
        )
    )
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="student not found")
    if student.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="student does not belong to your organization",
        )

    # Insert the assessment row with a generated R2 key
    assessment = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        s3_url="",  # filled in below once we know the assessment_id
        original_filename=payload.original_filename,
        status=AssessmentStatus.pending,
    )
    db.add(assessment)
    await db.flush()

    ext = _safe_extension(payload.original_filename)
    key = f"assessments/{user.organization_id}/{student.id}/{assessment.id}.{ext}"
    assessment.s3_url = key
    await db.flush()

    # Generate the presigned URL via the service layer (writes audit_log)
    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="assessment_upload_url",
        contains_pii=True,
        audit_reason="upload student assessment image",
    )
    upload_url = await storage_service.get_upload_url(
        ctx=ctx,
        key=key,
        content_type=payload.content_type,
        db=db,
    )

    return AssessmentCreateResponse(
        assessment_id=assessment.id,
        upload_url=upload_url,
        key=key,
    )
```

- [ ] **Step 5: Register router in `main.py`**

Modify `apps/api/src/grade_sight_api/main.py`:

```python
from .routers import assessments as assessments_router  # NEW
from .routers import billing as billing_router
from .routers import me as me_router
from .routers import students as students_router
from .routers.webhooks import stripe as stripe_webhook_router
```

```python
app.include_router(me_router.router)
app.include_router(billing_router.router)
app.include_router(students_router.router)
app.include_router(assessments_router.router)  # NEW
app.include_router(stripe_webhook_router.router)
```

Add B008 exemption in `apps/api/pyproject.toml` `[tool.ruff.lint.per-file-ignores]`:

```toml
"src/grade_sight_api/routers/assessments.py" = ["B008"]
```

(In alphabetical order alongside the existing entries.)

- [ ] **Step 6: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_assessments_router.py -v
```

Expected: 4 PASSED.

- [ ] **Step 7: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: 48 passed (44 before + 4 new), 2 skipped.

- [ ] **Step 8: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/schemas/assessments.py apps/api/src/grade_sight_api/routers/assessments.py apps/api/src/grade_sight_api/main.py apps/api/pyproject.toml apps/api/tests/routers/test_assessments_router.py
git commit -m "$(cat <<'EOF'
Add assessments router (GET, POST /api/assessments)

POST creates the assessment row in pending status AND returns a
presigned R2 PUT URL. Single endpoint by design — the row exists
before the upload starts so the diagnostic engine can find it later.
Browser uploads file bytes directly to R2 (FastAPI not in the upload
path).

R2 key follows assessments/{org_id}/{student_id}/{assessment_id}.{ext}.
No names in the key — data minimization preserved.

Validates: image/* content type, non-empty filename, student exists,
student belongs to user's org. 403 on cross-org student access.

GET joins assessments to students for student_name in the response,
filtered by user's org, ordered by uploaded_at DESC, limit 20 default
(max 100).

Four unit tests cover: pending row + presigned URL on success, 403 on
cross-org student, 400 on non-image content type, tenant scoping on
list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Frontend — `lib/api.ts` helpers

**Files:**
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Read the existing `lib/api.ts`**

```bash
cat /Users/exexporerporer/Projects/Grade-Sight/apps/web/lib/api.ts
```

Note the `authedFetch` pattern, the `env.NEXT_PUBLIC_API_URL` usage, the cookie-based Clerk session token retrieval. The new helpers follow the same pattern.

- [ ] **Step 2: Add four helpers**

Append to `/Users/exexporerporer/Projects/Grade-Sight/apps/web/lib/api.ts`:

```ts
// ---- Students ----

export interface Student {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  created_at: string;
}

export async function fetchStudents(): Promise<Student[]> {
  const response = await authedFetch(`/api/students`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/students failed: ${response.status}`);
  const body = (await response.json()) as { students: Student[] };
  return body.students;
}

export async function createStudent(input: {
  full_name: string;
  date_of_birth?: string;
}): Promise<Student> {
  const response = await authedFetch(`/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/students failed: ${response.status}`);
  }
  return (await response.json()) as Student;
}

// ---- Assessments ----

export type AssessmentStatus = "pending" | "processing" | "completed" | "failed";

export interface AssessmentListItem {
  id: string;
  student_id: string;
  student_name: string;
  original_filename: string;
  status: AssessmentStatus;
  uploaded_at: string;
}

export async function fetchAssessments(opts?: { limit?: number }): Promise<AssessmentListItem[]> {
  const limit = opts?.limit ?? 20;
  const response = await authedFetch(`/api/assessments?limit=${limit}`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/assessments failed: ${response.status}`);
  const body = (await response.json()) as { assessments: AssessmentListItem[] };
  return body.assessments;
}

export interface AssessmentUploadIntent {
  assessment_id: string;
  upload_url: string;
  key: string;
}

export async function createAssessmentForUpload(input: {
  student_id: string;
  original_filename: string;
  content_type: string;
}): Promise<AssessmentUploadIntent> {
  const response = await authedFetch(`/api/assessments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/assessments failed: ${response.status}`);
  }
  return (await response.json()) as AssessmentUploadIntent;
}
```

- [ ] **Step 3: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/lib/api.ts
git commit -m "$(cat <<'EOF'
Add students + assessments API client helpers

Four new lib/api.ts helpers using the existing authedFetch pattern:
- fetchStudents / createStudent for the /students roster page
- fetchAssessments / createAssessmentForUpload for the /upload form
  and dashboard recent list

createAssessmentForUpload returns the {assessment_id, upload_url, key}
shape — caller is responsible for PUTing the file bytes directly to
upload_url with the matching Content-Type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Frontend — `/students` page

**Files:**
- Create: `apps/web/components/add-student-form.tsx`
- Create: `apps/web/app/students/page.tsx`

- [ ] **Step 1: Create `add-student-form.tsx` (client component)**

Create `/Users/exexporerporer/Projects/Grade-Sight/apps/web/components/add-student-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createStudent } from "@/lib/api";

export function AddStudentForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      try {
        await createStudent({
          full_name: fullName.trim(),
          date_of_birth: dob || undefined,
        });
        setFullName("");
        setDob("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add student");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-sm)] border border-rule bg-paper p-6"
    >
      <h3 className="font-serif text-xl text-ink">Add a student</h3>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="full_name" className="block text-sm text-ink-soft">
            Full name <span className="text-mark">*</span>
          </label>
          <input
            id="full_name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
            required
          />
        </div>
        <div>
          <label htmlFor="dob" className="block text-sm text-ink-soft">
            Date of birth (optional)
          </label>
          <input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
          />
        </div>
      </div>
      {error && (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add student"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `/students` page (server component)**

Create `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/students/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { AddStudentForm } from "@/components/add-student-form";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchMe, fetchStudents } from "@/lib/api";

export default async function StudentsPage() {
  const [user, students] = await Promise.all([fetchMe(), fetchStudents()]);
  if (!user) redirect("/sign-in");

  return (
    <AppShell orgName={user.organization?.name}>
      <PageContainer className="max-w-[800px]">
        <SectionEyebrow>Roster</SectionEyebrow>
        <div className="mt-4 mb-10">
          <SerifHeadline level="page" as="h1">
            Your students
          </SerifHeadline>
        </div>

        {students.length === 0 ? (
          <p className="mb-10 text-base text-ink-soft">
            No students yet. Add your first one below.
          </p>
        ) : (
          <ul className="mb-10 divide-y divide-rule-soft border-y border-rule-soft">
            {students.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between py-3">
                <span className="text-base text-ink">{s.full_name}</span>
                {s.date_of_birth && (
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                    DOB {s.date_of_birth}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <AddStudentForm />
      </PageContainer>
    </AppShell>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/components/add-student-form.tsx apps/web/app/students/page.tsx
git commit -m "$(cat <<'EOF'
Add /students roster page with AddStudentForm

Server component fetches the student list via fetchStudents() (server-
side, with the Clerk session token) and renders a list + the
AddStudentForm client component below. AddStudentForm calls
createStudent() and router.refresh() on success so the new student
appears in the list without a full reload.

Form has full_name (required) and date_of_birth (optional). Validates
non-empty name client-side; the backend re-validates. Errors render
inline in the mark color. Disabled state during submit.

The page is the teacher's primary student-management surface for v1
(single-add only — batch / CSV import deferred).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Frontend — `/upload` page (StudentPicker + AssessmentUploadForm)

**Files:**
- Create: `apps/web/components/student-picker.tsx`
- Create: `apps/web/components/assessment-upload-form.tsx`
- Create: `apps/web/app/upload/page.tsx`

- [ ] **Step 1: Create `student-picker.tsx` (client)**

Create `/Users/exexporerporer/Projects/Grade-Sight/apps/web/components/student-picker.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Student } from "@/lib/api";
import { createStudent } from "@/lib/api";

export interface StudentPickerProps {
  students: Student[];
  value: string | null;
  onChange: (studentId: string) => void;
  onStudentAdded: (student: Student) => void;
}

export function StudentPicker({
  students,
  value,
  onChange,
  onStudentAdded,
}: StudentPickerProps) {
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleCreate = async () => {
    setError(null);
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    setIsPending(true);
    try {
      const created = await createStudent({ full_name: newName.trim() });
      onStudentAdded(created);
      onChange(created.id);
      setIsAdding(false);
      setNewName("");
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setIsPending(false);
    }
  };

  if (isAdding) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-4">
        <label htmlFor="new_student_name" className="block text-sm text-ink-soft">
          New student name
        </label>
        <input
          id="new_student_name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          autoFocus
        />
        {error && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-mark">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button onClick={handleCreate} disabled={isPending} size="sm">
            {isPending ? "Adding…" : "Add and select"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAdding(false);
              setNewName("");
              setError(null);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="student_search" className="block text-sm text-ink-soft">
        Student
      </label>
      <input
        id="student_search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search students…"
        className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
      />
      <div className="mt-2 max-h-60 overflow-y-auto rounded-[var(--radius-sm)] border border-rule">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-ink-mute">
            No matches.
          </div>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`block w-full px-3 py-2 text-left text-base hover:bg-paper-soft ${
              value === s.id ? "bg-accent-soft text-ink" : "text-ink"
            }`}
          >
            {s.full_name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="block w-full border-t border-rule-soft px-3 py-2 text-left text-base text-accent hover:bg-paper-soft"
        >
          + Add new student
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `assessment-upload-form.tsx` (client)**

Create `/Users/exexporerporer/Projects/Grade-Sight/apps/web/components/assessment-upload-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StudentPicker } from "@/components/student-picker";
import type { Student } from "@/lib/api";
import { createAssessmentForUpload } from "@/lib/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface AssessmentUploadFormProps {
  initialStudents: Student[];
}

export function AssessmentUploadForm({ initialStudents }: AssessmentUploadFormProps) {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setError("File too large (max 10MB)");
      e.target.value = "";
      setFile(null);
      return;
    }
    if (selected && !selected.type.startsWith("image/")) {
      setError("Only image files supported");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleStudentAdded = (s: Student) => {
    setStudents((prev) => [...prev, s].sort((a, b) => a.full_name.localeCompare(b.full_name)));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!studentId) {
      setError("Pick a student");
      return;
    }
    if (!file) {
      setError("Pick a file");
      return;
    }
    startTransition(async () => {
      try {
        const intent = await createAssessmentForUpload({
          student_id: studentId,
          original_filename: file.name,
          content_type: file.type,
        });
        const putRes = await fetch(intent.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) {
          throw new Error(`R2 upload failed: ${putRes.status}`);
        }
        router.push(`/dashboard?uploaded=${intent.assessment_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StudentPicker
        students={students}
        value={studentId}
        onChange={setStudentId}
        onStudentAdded={handleStudentAdded}
      />
      <div>
        <label htmlFor="file" className="block text-sm text-ink-soft">
          Quiz photo (image, max 10MB)
        </label>
        <input
          id="file"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="mt-1 block w-full text-base text-ink file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-rule file:bg-paper-soft file:px-3 file:py-2 file:text-sm file:text-ink hover:file:bg-paper-deep"
          disabled={isPending}
        />
        {file && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            {file.name} · {(file.size / 1024).toFixed(0)}KB
          </p>
        )}
      </div>
      {error && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending || !studentId || !file}>
        {isPending ? "Uploading…" : "Upload assessment"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `/upload` page (server component)**

Create `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/upload/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AssessmentUploadForm } from "@/components/assessment-upload-form";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchMe, fetchStudents } from "@/lib/api";

export default async function UploadPage() {
  const [user, students] = await Promise.all([fetchMe(), fetchStudents()]);
  if (!user) redirect("/sign-in");

  return (
    <AppShell orgName={user.organization?.name}>
      <PageContainer className="max-w-[640px]">
        <SectionEyebrow>Upload assessment</SectionEyebrow>
        <div className="mt-4 mb-8">
          <SerifHeadline level="page" as="h1">
            Add a graded quiz.
          </SerifHeadline>
        </div>
        <p className="mb-8 text-base text-ink-soft">
          Pick a student and upload a photo of their graded work. Grade Sight
          will diagnose the error patterns once the assessment processes.
        </p>
        <AssessmentUploadForm initialStudents={students} />
      </PageContainer>
    </AppShell>
  );
}
```

- [ ] **Step 4: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/components/student-picker.tsx apps/web/components/assessment-upload-form.tsx apps/web/app/upload/page.tsx
git commit -m "$(cat <<'EOF'
Add /upload page with StudentPicker and AssessmentUploadForm

Server component server-fetches students and renders the client-side
upload form. Form composes:
- StudentPicker — searchable list with "+ Add new student" inline form
  that calls createStudent() and pre-selects the new entry
- File picker — accepts image/*, gates 10MB client-side
- Submit — calls createAssessmentForUpload() to get the presigned URL
  then PUTs the file directly to R2 with the matching Content-Type
  header. On success, redirects to /dashboard?uploaded=<id>

The MAX_FILE_SIZE constant (10MB) is enforced client-side; backend
doesn't enforce per the v1 spec (R2 free tier absorbs malicious
bypass at prototype scale; documented in the design doc).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Frontend — Dashboard updates (CTA + RecentAssessmentsList)

**Files:**
- Create: `apps/web/components/recent-assessments-list.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`

- [ ] **Step 1: Create `recent-assessments-list.tsx` (server component)**

Create `/Users/exexporerporer/Projects/Grade-Sight/apps/web/components/recent-assessments-list.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionEyebrow } from "@/components/section-eyebrow";
import type { AssessmentListItem } from "@/lib/api";

const STATUS_LABEL: Record<AssessmentListItem["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface RecentAssessmentsListProps {
  assessments: AssessmentListItem[];
}

export function RecentAssessmentsList({ assessments }: RecentAssessmentsListProps) {
  return (
    <Card className="border-rule bg-paper shadow-none">
      <CardContent className="p-6">
        <SectionEyebrow>Recent assessments</SectionEyebrow>
        <ul className="mt-4 divide-y divide-rule-soft">
          {assessments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base text-ink">{a.original_filename}</p>
                <p className="text-sm text-ink-soft">
                  {a.student_name} · {timeAgo(a.uploaded_at)}
                </p>
              </div>
              <Badge variant="secondary" className="font-mono uppercase tracking-[0.12em]">
                {STATUS_LABEL[a.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Update `app/dashboard/page.tsx`**

Modify `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/dashboard/page.tsx`. Change three things:

1. Add `fetchAssessments` import from `@/lib/api`.
2. Add `RecentAssessmentsList` component import.
3. Add `Link` from next/link and `Button` from `@/components/ui/button` (if not already imported).
4. In the `Promise.all`, fetch assessments alongside user + entitlement.
5. After the existing greeting block, add:
   - "Upload assessment" button (links to `/upload`).
   - If `assessments.length > 0`: render `<RecentAssessmentsList assessments={assessments} />`. Else: keep the existing `EmptyState`.

Full updated file:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";

import { createCheckoutSession, fetchAssessments, fetchEntitlement, fetchMe } from "@/lib/api";
import { TrialBanner } from "@/components/trial-banner";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SerifHeadline } from "@/components/serif-headline";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { EmptyState } from "@/components/empty-state";
import { RecentAssessmentsList } from "@/components/recent-assessments-list";
import { Button } from "@/components/ui/button";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

function daysUntil(iso: string, now: number): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - now) / (1000 * 60 * 60 * 24)),
  );
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [user, entitlement, assessments] = await Promise.all([
    fetchMe(),
    fetchEntitlement(),
    fetchAssessments({ limit: 10 }),
  ]);
  if (!user) redirect("/sign-in");

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  // eslint-disable-next-line react-hooks/purity -- server component, runs per request
  const now = new Date();
  const nowMs = now.getTime();
  const daysRemaining =
    entitlement?.trial_ends_at != null
      ? daysUntil(entitlement.trial_ends_at, nowMs)
      : null;
  const showBanner =
    entitlement?.status === "trialing" &&
    daysRemaining !== null &&
    daysRemaining <= 7;

  return (
    <AppShell orgName={user.organization?.name}>
      <PageContainer>
        {showBanner && daysRemaining !== null && (
          <div className="mb-10">
            <TrialBanner
              daysRemaining={daysRemaining}
              role={user.role === "teacher" ? "teacher" : "parent"}
              onAddCard={handleCheckout}
            />
          </div>
        )}
        <SectionEyebrow>Dashboard</SectionEyebrow>
        <div className="mt-4">
          <SerifHeadline level="greeting">
            {greeting(now)}, {user.first_name || displayName}.
          </SerifHeadline>
        </div>
        <div className="mt-10 mb-12">
          <Button asChild size="lg">
            <Link href="/upload">Upload assessment</Link>
          </Button>
        </div>
        {assessments.length === 0 ? (
          <EmptyState
            eyebrow={<SectionEyebrow>No uploads yet</SectionEyebrow>}
            title="No assessments yet."
            body="When you're ready, upload a photo of your student's quiz or test and we'll tell you what we saw."
          />
        ) : (
          <RecentAssessmentsList assessments={assessments} />
        )}
      </PageContainer>
    </AppShell>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/components/recent-assessments-list.tsx apps/web/app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
Add Upload CTA + RecentAssessmentsList to dashboard

The dashboard greeting block stays. Below it: a primary "Upload
assessment" CTA linking to /upload, followed by either the existing
EmptyState (zero uploads) or a RecentAssessmentsList card showing up
to 10 recent uploads with student name, filename, status badge, and
time-ago.

RecentAssessmentsList is a server component (no client interactivity);
it just renders the props. Status badges use the same mono-uppercase
styling as the billing page's status badge for consistency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Manual smoke test + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

This task verifies the full flow works end-to-end and marks Spec 9 complete.

- [ ] **Step 1: Run the local stack**

Open two terminals.

Terminal 1 (background):
```bash
cd /Users/exexporerporer/Projects/Grade-Sight
pnpm dev
```

Wait for `[web] ✓ Ready in <ms>` and `[api] Application startup complete.`.

- [ ] **Step 2: Manual smoke test**

In a browser:

1. Navigate to http://localhost:3000.
2. If signed in as a teacher already, use that account. Otherwise sign up via `/sign-up/teacher`.
3. Navigate to `/students`. Confirm the page loads with "No students yet" or an existing list.
4. Add a student with the form (name "Test Student"). Confirm it appears in the list.
5. Navigate to `/dashboard`. Confirm the "Upload assessment" CTA shows. The recent list shows EmptyState ("No assessments yet").
6. Click "Upload assessment". You're on `/upload`.
7. Pick "Test Student" from the StudentPicker (search/click).
8. Pick an image file from disk (any PNG or JPG).
9. Click "Upload assessment". Wait for it to finish.
10. You're redirected to `/dashboard?uploaded=<some-id>`. Refresh the page if needed.
11. The recent list now shows your upload: filename, "Test Student", "Pending" badge, "just now".

If any step fails, capture the error (browser console, `pnpm dev` API logs) and report **DONE_WITH_CONCERNS** with details. Otherwise proceed.

- [ ] **Step 3: Verify the R2 object exists**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run python -c "
import asyncio
from grade_sight_api.db import async_session_factory
from grade_sight_api.models.assessment import Assessment
from sqlalchemy import select

async def check():
    async with async_session_factory() as s:
        rows = (await s.execute(select(Assessment).order_by(Assessment.uploaded_at.desc()).limit(1))).scalars().all()
        for a in rows:
            print(f'assessment_id={a.id}')
            print(f'  s3_url (key)={a.s3_url}')
            print(f'  status={a.status}')
            print(f'  filename={a.original_filename}')

asyncio.run(check())
"
```

Expected: prints the most recent assessment with `s3_url` set to the R2 key in the form `assessments/<org_id>/<student_id>/<assessment_id>.<ext>`.

Optionally, in the Cloudflare R2 dashboard, navigate to the bucket and confirm the object is present at that key.

- [ ] **Step 4: Update CLAUDE.md phase line**

Open `/Users/exexporerporer/Projects/Grade-Sight/CLAUDE.md`. Find:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), and 8 (taxonomy schema + seeding) complete. Next: assessment upload UI shell, then diagnostic engine spec.
```

Replace with:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), and 9 (assessment upload UI shell) complete. Next: diagnostic engine spec.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Mark Spec 9 (assessment upload UI shell) complete in CLAUDE.md

Spec 9 acceptance is done: students roster page (/students), upload
page (/upload), dashboard CTA + recent uploads list, four backend
endpoints (GET/POST students, GET/POST assessments) tenant-scoped by
organization_id, 7 backend unit tests, manual smoke test verified
end-to-end (assessment row created, file uploaded to R2, recent list
renders the new entry).

Next surface is the diagnostic engine — Claude vision prompts that
consume the v1 taxonomy at runtime via prompt-cached context to
classify error patterns on uploaded assessments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wrap-up

After Task 7, the branch has 7 commits ahead of origin/main:

```bash
git log --oneline origin/main..HEAD
```

Expected:
```
<sha> Mark Spec 9 (assessment upload UI shell) complete in CLAUDE.md
<sha> Add Upload CTA + RecentAssessmentsList to dashboard
<sha> Add /upload page with StudentPicker and AssessmentUploadForm
<sha> Add /students roster page with AddStudentForm
<sha> Add students + assessments API client helpers
<sha> Add assessments router (GET, POST /api/assessments)
<sha> Add students router (GET, POST /api/students)
```

Test status: 48 passed, 2 skipped. Manual smoke verified.

Push when ready:

```bash
git push origin main
```

## Out of scope for this plan (deferred)

- **Diagnostic engine integration** — wires Claude vision to classify uploaded assessments. Separate spec.
- **`/assessments/[id]` detail view** — small follow-up.
- **Class assignment** — gated until teachers ask.
- **Answer key upload** — separate spec; required for diagnostic engine.
- **Batch upload** — teacher feature.
- **Orphan-row cleanup** — periodic detector for `pending` rows with no R2 object.
- **Server-side file size enforcement** — content-length-range policy.
- **Frontend test harness** — Vitest setup + tests for upload form + student picker.
- **GTM doc update** — `PROJECT_BRIEF.md` and `CLAUDE.md` "parent mode (primary early traction)" framing should be updated to reflect teacher-first decision. Small follow-up commit.
- **Image preview before submit** — show thumbnail.
- **Parent flow** — single-student-friendly variant.
