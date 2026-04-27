# Answer Key + Engine Modes Implementation Plan (Spec 12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional answer-key support (multi-page upload + inline picker) and two new engine modes (with-key, already-graded) plus wrong-only output. Three engine paths: auto-grade (Spec 11 default), with-key (teacher's primary), already-graded (parent's primary).

**Architecture:** Refactor existing `answer_keys` table (drop legacy single-image `s3_url` + unused `content` JSONB), add `answer_key_pages` table mirroring `assessment_pages`. Add `already_graded` + `review_all` flags to assessments and `total_problems_seen` + `analysis_mode` to diagnoses. New AnswerKey CRUD endpoints parallel the assessments router. Engine service derives mode from two simple inputs (key picker + already-graded checkbox), branches on three prompt variants, and stores wrong-only observations + a total count when applicable. Frontend adds `AnswerKeyUploadForm` + `AnswerKeyPicker` components and wires them into the existing `/upload` page.

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy 2 async + Alembic + asyncpg + Anthropic Python SDK; Next.js 16 (App Router) + Tailwind 4 + shadcn/ui.

---

## Reference Documents

- `docs/superpowers/specs/2026-04-27-answer-key-and-modes-design.md` — the spec.
- `docs/superpowers/plans/2026-04-26-multi-page-assessment-upload.md` — Spec 10's plan, the canonical reference for multi-page upload patterns. AnswerKey upload mirrors AssessmentPage upload.
- `docs/superpowers/plans/2026-04-27-diagnostic-engine-v1.md` — Spec 11's plan, the canonical reference for engine_service updates.
- `apps/api/alembic/versions/ec66654a8218_add_diagnostic_engine_tables.py` — current head; new migration's `down_revision` is `"ec66654a8218"`.
- `apps/api/src/grade_sight_api/models/answer_key.py` — existing model to refactor.
- `apps/api/src/grade_sight_api/models/assessment_page.py` — pattern for `AnswerKeyPage`.
- `apps/api/src/grade_sight_api/routers/assessments.py` — pattern for `routers/answer_keys.py` (POST upload + GET list + GET detail + DELETE).
- `apps/api/src/grade_sight_api/services/engine_service.py` — file to extend with mode derivation + prompt variants.
- `apps/web/components/assessment-upload-form.tsx` — pattern for `AnswerKeyUploadForm`.
- `apps/web/components/student-picker.tsx` — pattern for `AnswerKeyPicker`.

## Pre-merge checklist (every task)

1. `cd apps/api && ~/.local/bin/uv run ruff check` — clean.
2. `cd apps/api && ~/.local/bin/uv run mypy src tests` — clean.
3. `cd apps/api && ~/.local/bin/uv run pytest -q` — all default tests pass.
4. `cd apps/web && pnpm lint && pnpm typecheck` — clean (frontend tasks).
5. Commit: imperative subject, body explains *why*, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Build-broken intermediate state

Backend Tasks 1-4 are additive (new columns default to false/null; new endpoints don't break existing ones). Tasks 5-8 add new optional frontend fields without breaking existing flows. The user-facing flow stays usable throughout (existing assessments without keys continue to auto-grade).

---

## Task 1: Schema (models + migration + tests)

**Files:**
- Create: `apps/api/src/grade_sight_api/models/answer_key_page.py`
- Modify: `apps/api/src/grade_sight_api/models/answer_key.py` (drop `s3_url` + `content`; add `pages` relationship)
- Modify: `apps/api/src/grade_sight_api/models/assessment.py` (add `already_graded` + `review_all` columns; add `answer_key` relationship)
- Modify: `apps/api/src/grade_sight_api/models/assessment_diagnosis.py` (add `total_problems_seen` + `analysis_mode`)
- Modify: `apps/api/src/grade_sight_api/models/__init__.py` (re-export `AnswerKeyPage`)
- Create: `apps/api/alembic/versions/<auto>_add_answer_key_pages_and_engine_modes.py`
- Create: `apps/api/tests/models/test_answer_key_page.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/models/test_answer_key_page.py`:

```python
"""Tests for AnswerKeyPage model + Assessment/AssessmentDiagnosis column additions."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.answer_key_page import AnswerKeyPage
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_org_and_user(
    session: AsyncSession,
) -> tuple[Organization, User]:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Test",
        last_name="Teacher",
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    return org, user


async def test_answer_key_page_round_trip(async_session: AsyncSession) -> None:
    org, user = await _seed_org_and_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=org.id,
        name="Algebra Quiz 1 Key",
    )
    async_session.add(key)
    await async_session.flush()

    page = AnswerKeyPage(
        answer_key_id=key.id,
        organization_id=org.id,
        page_number=1,
        s3_url=f"answer-keys/{org.id}/{key.id}/page-001.png",
        original_filename="page-1.png",
        content_type="image/png",
    )
    async_session.add(page)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(AnswerKeyPage).where(AnswerKeyPage.answer_key_id == key.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].page_number == 1
    assert rows[0].original_filename == "page-1.png"


async def test_answer_key_page_unique_constraint(
    async_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=org.id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()

    page_a = AnswerKeyPage(
        answer_key_id=key.id,
        organization_id=org.id,
        page_number=1,
        s3_url="key-a.png",
        original_filename="a.png",
        content_type="image/png",
    )
    page_b = AnswerKeyPage(
        answer_key_id=key.id,
        organization_id=org.id,
        page_number=1,
        s3_url="key-b.png",
        original_filename="b.png",
        content_type="image/png",
    )
    async_session.add(page_a)
    async_session.add(page_b)

    with pytest.raises(IntegrityError):
        await async_session.flush()


async def test_assessment_new_columns_default_false(
    async_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(async_session)
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    async_session.add(student)
    await async_session.flush()

    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()
    await async_session.refresh(asmt)

    assert asmt.already_graded is False
    assert asmt.review_all is False
    assert asmt.answer_key_id is None


async def test_diagnosis_analysis_mode_default(
    async_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(async_session)
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    async_session.add(student)
    await async_session.flush()
    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()

    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=100,
        tokens_output=20,
        cost_usd=Decimal("0.01"),
        latency_ms=100,
        analysis_mode="auto_grade",
    )
    async_session.add(diag)
    await async_session.flush()
    await async_session.refresh(diag)

    assert diag.analysis_mode == "auto_grade"
    assert diag.total_problems_seen is None
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/models/test_answer_key_page.py -v
```

Expected: 4 tests FAIL with `ImportError: cannot import name 'AnswerKeyPage'` or `AttributeError: 'Assessment' object has no attribute 'already_graded'`.

- [ ] **Step 3: Create the AnswerKeyPage model**

Create `apps/api/src/grade_sight_api/models/answer_key_page.py`:

```python
"""AnswerKeyPage — one image of an answer key.

Mirror of AssessmentPage. AnswerKey can have N pages, each with its own
R2 key + filename. (answer_key_id, page_number) is unique.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .answer_key import AnswerKey


class AnswerKeyPage(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "answer_key_pages"
    __table_args__ = (
        UniqueConstraint(
            "answer_key_id",
            "page_number",
            name="uq_answer_key_pages_answer_key_id_page_number",
        ),
        Index("ix_answer_key_pages_answer_key_id", "answer_key_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    answer_key_id: Mapped[UUID] = mapped_column(
        ForeignKey("answer_keys.id", ondelete="RESTRICT"),
        nullable=False,
    )
    page_number: Mapped[int] = mapped_column(nullable=False)
    s3_url: Mapped[str] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(nullable=False)
    content_type: Mapped[str] = mapped_column(nullable=False)

    answer_key: Mapped[AnswerKey] = relationship(
        "AnswerKey",
        back_populates="pages",
        lazy="select",
    )
```

- [ ] **Step 4: Refactor the AnswerKey model**

Replace `apps/api/src/grade_sight_api/models/answer_key.py` entirely:

```python
"""AnswerKey model — multi-page reference data for grading assessments.

Owns N AnswerKeyPage rows. Each Assessment can optionally reference one
AnswerKey via assessments.answer_key_id (FK from Spec 2).
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .answer_key_page import AnswerKeyPage


class AnswerKey(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "answer_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(nullable=False)

    pages: Mapped[list[AnswerKeyPage]] = relationship(
        "AnswerKeyPage",
        back_populates="answer_key",
        order_by="AnswerKeyPage.page_number",
        lazy="selectin",
    )
```

(Removes `s3_url` and `content` columns; adds `pages` relationship.)

- [ ] **Step 5: Add columns + relationship to Assessment model**

Open `apps/api/src/grade_sight_api/models/assessment.py`. Add the AnswerKey to the TYPE_CHECKING block:

```python
if TYPE_CHECKING:
    from .answer_key import AnswerKey
    from .assessment_diagnosis import AssessmentDiagnosis
    from .assessment_page import AssessmentPage
```

Inside the `Assessment` class, find the existing column block (after `uploaded_at`) and add the new boolean columns + the answer_key relationship. The final structure should look like:

```python
    uploaded_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("now()"),
    )
    already_graded: Mapped[bool] = mapped_column(
        nullable=False,
        server_default=text("false"),
    )
    review_all: Mapped[bool] = mapped_column(
        nullable=False,
        server_default=text("false"),
    )

    pages: Mapped[list["AssessmentPage"]] = relationship(
        "AssessmentPage",
        back_populates="assessment",
        order_by="AssessmentPage.page_number",
        lazy="select",
    )
    diagnosis: Mapped[AssessmentDiagnosis | None] = relationship(
        "AssessmentDiagnosis",
        back_populates="assessment",
        uselist=False,
        lazy="select",
    )
    answer_key: Mapped[AnswerKey | None] = relationship(
        "AnswerKey",
        lazy="select",
    )
```

- [ ] **Step 6: Add columns to AssessmentDiagnosis**

Open `apps/api/src/grade_sight_api/models/assessment_diagnosis.py`. Find the `overall_summary` column and add `total_problems_seen` and `analysis_mode` after it:

```python
    overall_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_problems_seen: Mapped[int | None] = mapped_column(nullable=True)
    analysis_mode: Mapped[str] = mapped_column(
        nullable=False,
        server_default=text("'auto_grade'"),
    )
```

Add `text` to the existing imports if not already there:

```python
from sqlalchemy import ForeignKey, Numeric, Text, text
```

- [ ] **Step 7: Re-export the new model in `models/__init__.py`**

Modify `apps/api/src/grade_sight_api/models/__init__.py`. Add the import in alphabetical order:

```python
from .answer_key import AnswerKey
from .answer_key_page import AnswerKeyPage  # NEW
from .assessment import Assessment, AssessmentStatus
```

Add to `__all__` in alphabetical order:

```python
__all__ = [
    "AnswerKey",
    "AnswerKeyPage",  # NEW
    "Assessment",
    ...
]
```

- [ ] **Step 8: Generate the Alembic migration**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run alembic revision --autogenerate -m "add answer key pages and engine modes"
```

Open the generated file at `apps/api/alembic/versions/<rev>_add_answer_key_pages_and_engine_modes.py`. Replace `upgrade()` and `downgrade()` with this content (keep the auto-generated `revision` and `Create Date`):

```python
"""add answer key pages and engine modes

Revision ID: <KEEP GENERATED>
Revises: ec66654a8218
Create Date: <KEEP GENERATED>

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "<KEEP GENERATED>"
down_revision: Union[str, Sequence[str], None] = "ec66654a8218"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create answer_key_pages table
    op.create_table(
        "answer_key_pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("answer_key_id", sa.Uuid(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("s3_url", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["answer_key_id"],
            ["answer_keys.id"],
            name=op.f("fk_answer_key_pages_answer_key_id_answer_keys"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_answer_key_pages_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_answer_key_pages")),
        sa.UniqueConstraint(
            "answer_key_id",
            "page_number",
            name="uq_answer_key_pages_answer_key_id_page_number",
        ),
    )
    op.create_index(
        "ix_answer_key_pages_answer_key_id",
        "answer_key_pages",
        ["answer_key_id"],
        unique=False,
    )

    # Drop legacy AnswerKey columns
    op.drop_column("answer_keys", "s3_url")
    op.drop_column("answer_keys", "content")

    # Add Assessment columns
    op.add_column(
        "assessments",
        sa.Column(
            "already_graded",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "assessments",
        sa.Column(
            "review_all",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Add AssessmentDiagnosis columns
    op.add_column(
        "assessment_diagnoses",
        sa.Column("total_problems_seen", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assessment_diagnoses",
        sa.Column(
            "analysis_mode",
            sa.String(),
            nullable=False,
            server_default=sa.text("'auto_grade'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("assessment_diagnoses", "analysis_mode")
    op.drop_column("assessment_diagnoses", "total_problems_seen")
    op.drop_column("assessments", "review_all")
    op.drop_column("assessments", "already_graded")
    op.add_column(
        "answer_keys",
        sa.Column("content", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "answer_keys",
        sa.Column("s3_url", sa.String(), nullable=True),
    )
    op.drop_index(
        "ix_answer_key_pages_answer_key_id",
        table_name="answer_key_pages",
    )
    op.drop_table("answer_key_pages")
```

If autogen produced extra calls (renaming, altering unrelated columns), DELETE them. The migration must only touch the columns/tables listed above.

- [ ] **Step 9: Apply the migration to dev + test DBs**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run alembic upgrade head
DATABASE_URL=postgresql+asyncpg://grade_sight@localhost:5432/grade_sight_test ~/.local/bin/uv run alembic upgrade head
```

Both end with `Running upgrade ec66654a8218 -> <new rev>, add answer key pages and engine modes`. (Replace `grade_sight` with the actual local pg user if different — Spec 11 Task 1 used `grade_sight` per the implementer's notes.)

- [ ] **Step 10: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/models/test_answer_key_page.py -v
```

Expected: 4 PASSED.

- [ ] **Step 11: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~73 prior + 4 new = ~77 passed, 2 skipped.

- [ ] **Step 12: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/models/answer_key_page.py apps/api/src/grade_sight_api/models/answer_key.py apps/api/src/grade_sight_api/models/assessment.py apps/api/src/grade_sight_api/models/assessment_diagnosis.py apps/api/src/grade_sight_api/models/__init__.py apps/api/alembic/versions/*_add_answer_key_pages_and_engine_modes.py apps/api/tests/models/test_answer_key_page.py
git commit -m "$(cat <<'EOF'
Add answer_key_pages table + assessment / diagnosis mode columns

Schema for Spec 12 (answer key + engine modes):
- New AnswerKeyPage model (1:N from AnswerKey, mirrors AssessmentPage).
  UNIQUE on (answer_key_id, page_number); indexed on answer_key_id.
- Refactored AnswerKey: dropped legacy s3_url and unused content JSONB
  (Spec 2 created the table but nothing consumed those columns).
- Assessment: new already_graded + review_all bool columns (default
  false); answer_key_id FK from Spec 2 finally gets wired up via
  the new answer_key relationship.
- AssessmentDiagnosis: new total_problems_seen (nullable int) and
  analysis_mode (NOT NULL default 'auto_grade'; existing diagnoses
  backfill to that value).

Migration: additive table + columns, plus dropping the two unused
legacy AnswerKey columns. Empty in dev so no data migration needed.

Four model tests: AnswerKeyPage round-trip + UNIQUE violation,
Assessment column defaults, AssessmentDiagnosis analysis_mode default.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend AnswerKey CRUD endpoints + 12 tests

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/answer_keys.py`
- Create: `apps/api/src/grade_sight_api/routers/answer_keys.py`
- Modify: `apps/api/src/grade_sight_api/main.py` (register router)
- Modify: `apps/api/pyproject.toml` (B008 exemption)
- Create: `apps/api/tests/routers/test_answer_keys_router.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/routers/test_answer_keys_router.py`:

```python
"""Tests for the answer_keys router (POST/GET list/GET detail/DELETE).

Mirror of test_assessments_router.py. 12 tests across the 4 endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.answer_key_page import AnswerKeyPage
from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.user import User, UserRole


def _override_deps(user: User, session: AsyncSession) -> None:
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session


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
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_answer_keys_router.py -v
```

Expected: 12 tests FAIL with `ImportError` or `404 Not Found` (router doesn't exist).

- [ ] **Step 3: Create the Pydantic schemas**

Create `apps/api/src/grade_sight_api/schemas/answer_keys.py`:

```python
"""Pydantic schemas for the answer_keys router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AnswerKeyFile(BaseModel):
    filename: str
    content_type: str


class AnswerKeyCreateRequest(BaseModel):
    name: str
    files: list[AnswerKeyFile]


class AnswerKeyPageUploadIntent(BaseModel):
    page_number: int
    key: str
    upload_url: str


class AnswerKeyCreateResponse(BaseModel):
    answer_key_id: UUID
    pages: list[AnswerKeyPageUploadIntent]


class AnswerKeySummary(BaseModel):
    id: UUID
    name: str
    page_count: int
    first_page_thumbnail_url: str
    created_at: datetime


class AnswerKeyListResponse(BaseModel):
    answer_keys: list[AnswerKeySummary]


class AnswerKeyDetailPage(BaseModel):
    page_number: int
    original_filename: str
    view_url: str


class AnswerKeyDetailResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    pages: list[AnswerKeyDetailPage]
```

- [ ] **Step 4: Create the router**

Create `apps/api/src/grade_sight_api/routers/answer_keys.py`:

```python
"""Answer keys router — list, create, detail, delete.

Mirror of routers/assessments.py for AnswerKey + AnswerKeyPage. Tenant-
scoped via user.organization_id. POST creates the AnswerKey + N
AnswerKeyPage rows in one transaction and returns N presigned PUT URLs;
the browser uploads bytes directly to R2.

R2 key shape: answer-keys/{org_id}/{answer_key_id}/page-{nnn}.{ext}.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
from ..models.user import User
from ..schemas.answer_keys import (
    AnswerKeyCreateRequest,
    AnswerKeyCreateResponse,
    AnswerKeyDetailPage,
    AnswerKeyDetailResponse,
    AnswerKeyListResponse,
    AnswerKeyPageUploadIntent,
    AnswerKeySummary,
)
from ..services import storage_service
from ..services.call_context import CallContext

MAX_PAGES_PER_KEY = 20

router = APIRouter()


def _safe_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lstrip(".").lower()
    return suffix or "bin"


@router.get("/api/answer-keys", response_model=AnswerKeyListResponse)
async def list_answer_keys(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AnswerKeyListResponse:
    """List user's org's answer keys, ordered by created_at DESC."""
    if user.organization_id is None:
        return AnswerKeyListResponse(answer_keys=[])

    page_count_subq = (
        select(
            AnswerKeyPage.answer_key_id.label("answer_key_id"),
            func.count(AnswerKeyPage.id).label("page_count"),
        )
        .where(AnswerKeyPage.deleted_at.is_(None))
        .group_by(AnswerKeyPage.answer_key_id)
        .subquery()
    )
    first_page_subq = (
        select(
            AnswerKeyPage.answer_key_id.label("answer_key_id"),
            AnswerKeyPage.s3_url.label("first_page_key"),
        )
        .where(
            AnswerKeyPage.page_number == 1,
            AnswerKeyPage.deleted_at.is_(None),
        )
        .subquery()
    )

    result = await db.execute(
        select(
            AnswerKey,
            page_count_subq.c.page_count,
            first_page_subq.c.first_page_key,
        )
        .join(
            page_count_subq,
            AnswerKey.id == page_count_subq.c.answer_key_id,
            isouter=True,
        )
        .join(
            first_page_subq,
            AnswerKey.id == first_page_subq.c.answer_key_id,
            isouter=True,
        )
        .where(
            AnswerKey.organization_id == user.organization_id,
            AnswerKey.deleted_at.is_(None),
        )
        .order_by(AnswerKey.created_at.desc())
        .limit(limit)
    )

    items: list[AnswerKeySummary] = []
    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="answer_key_list_thumbnails",
        contains_pii=False,
        audit_reason="render answer key picker thumbnails",
    )
    for key_row, page_count, first_page_key in result.all():
        if first_page_key is None:
            continue
        thumb_url = await storage_service.get_download_url(
            ctx=ctx,
            key=first_page_key,
            db=db,
        )
        items.append(
            AnswerKeySummary(
                id=key_row.id,
                name=key_row.name,
                page_count=int(page_count or 0),
                first_page_thumbnail_url=thumb_url,
                created_at=key_row.created_at,
            )
        )
    return AnswerKeyListResponse(answer_keys=items)


@router.post(
    "/api/answer-keys",
    response_model=AnswerKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_answer_key(
    payload: AnswerKeyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AnswerKeyCreateResponse:
    """Create an AnswerKey + N AnswerKeyPage rows; return N presigned PUT URLs."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name is required",
        )
    if not payload.files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="files is required",
        )
    if len(payload.files) > MAX_PAGES_PER_KEY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"max {MAX_PAGES_PER_KEY} pages per answer key",
        )
    for f in payload.files:
        if not f.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="content_type must be image/*",
            )
        if not f.filename.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="filename is required",
            )

    answer_key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name=name,
    )
    db.add(answer_key)
    await db.flush()

    pages: list[AnswerKeyPage] = []
    for index, f in enumerate(payload.files, start=1):
        filename = f.filename.strip()
        ext = _safe_extension(filename)
        key = (
            f"answer-keys/{user.organization_id}/"
            f"{answer_key.id}/page-{index:03d}.{ext}"
        )
        page = AnswerKeyPage(
            answer_key_id=answer_key.id,
            page_number=index,
            s3_url=key,
            original_filename=filename,
            content_type=f.content_type,
            organization_id=user.organization_id,
        )
        db.add(page)
        pages.append(page)
    await db.flush()

    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="answer_key_upload_url",
        contains_pii=False,
        audit_reason="upload answer key image",
    )
    intents: list[AnswerKeyPageUploadIntent] = []
    for page, f in zip(pages, payload.files, strict=True):
        upload_url = await storage_service.get_upload_url(
            ctx=ctx,
            key=page.s3_url,
            content_type=f.content_type,
            db=db,
        )
        intents.append(
            AnswerKeyPageUploadIntent(
                page_number=page.page_number,
                key=page.s3_url,
                upload_url=upload_url,
            )
        )

    return AnswerKeyCreateResponse(
        answer_key_id=answer_key.id,
        pages=intents,
    )


@router.get(
    "/api/answer-keys/{answer_key_id}",
    response_model=AnswerKeyDetailResponse,
)
async def get_answer_key_detail(
    answer_key_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AnswerKeyDetailResponse:
    """Full answer key detail with one presigned GET per page."""
    result = await db.execute(
        select(AnswerKey).where(
            AnswerKey.id == answer_key_id,
            AnswerKey.deleted_at.is_(None),
        )
    )
    answer_key = result.scalar_one_or_none()
    if answer_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="answer key not found",
        )
    if answer_key.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="answer key does not belong to your organization",
        )

    pages_result = await db.execute(
        select(AnswerKeyPage)
        .where(
            AnswerKeyPage.answer_key_id == answer_key.id,
            AnswerKeyPage.deleted_at.is_(None),
        )
        .order_by(AnswerKeyPage.page_number)
    )
    pages = pages_result.scalars().all()

    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="answer_key_detail",
        contains_pii=False,
        audit_reason="render answer key detail page",
    )
    detail_pages: list[AnswerKeyDetailPage] = []
    for p in pages:
        view_url = await storage_service.get_download_url(
            ctx=ctx, key=p.s3_url, db=db
        )
        detail_pages.append(
            AnswerKeyDetailPage(
                page_number=p.page_number,
                original_filename=p.original_filename,
                view_url=view_url,
            )
        )

    return AnswerKeyDetailResponse(
        id=answer_key.id,
        name=answer_key.name,
        created_at=answer_key.created_at,
        pages=detail_pages,
    )


@router.delete(
    "/api/answer-keys/{answer_key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_answer_key(
    answer_key_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Soft-delete the answer key. Existing assessments referencing it
    still resolve via FK (deleted_at is not filtered when the engine
    loads the key)."""
    from datetime import UTC, datetime

    result = await db.execute(
        select(AnswerKey).where(
            AnswerKey.id == answer_key_id,
            AnswerKey.deleted_at.is_(None),
        )
    )
    answer_key = result.scalar_one_or_none()
    if answer_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="answer key not found",
        )
    if answer_key.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="answer key does not belong to your organization",
        )
    answer_key.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db.flush()
```

- [ ] **Step 5: Register router in `main.py`**

Open `apps/api/src/grade_sight_api/main.py`. Add the import in alphabetical order with existing routers:

```python
from .routers import answer_keys as answer_keys_router  # NEW
from .routers import assessments as assessments_router
```

Add the include_router call alongside the others (alphabetical):

```python
app.include_router(answer_keys_router.router)  # NEW
app.include_router(assessments_router.router)
```

- [ ] **Step 6: Add B008 exemption in `pyproject.toml`**

Open `apps/api/pyproject.toml`, find the `[tool.ruff.lint.per-file-ignores]` block. Add this line in alphabetical order (between `assessments.py` and `billing.py`):

```toml
"src/grade_sight_api/routers/answer_keys.py" = ["B008"]
```

- [ ] **Step 7: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_answer_keys_router.py -v
```

Expected: 12 PASSED.

- [ ] **Step 8: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~77 prior + 12 new = ~89 passed, 2 skipped.

- [ ] **Step 9: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/schemas/answer_keys.py apps/api/src/grade_sight_api/routers/answer_keys.py apps/api/src/grade_sight_api/main.py apps/api/pyproject.toml apps/api/tests/routers/test_answer_keys_router.py
git commit -m "$(cat <<'EOF'
Add answer-keys CRUD router (POST/GET list/GET detail/DELETE)

POST creates the AnswerKey + N AnswerKeyPage rows in one tx and
returns N presigned PUT URLs. GET list joins page_count + first-page
thumbnail subqueries; GET detail returns all pages with view URLs;
DELETE soft-deletes (existing assessment.answer_key_id refs still
resolve through the FK regardless of deleted_at).

R2 key shape: answer-keys/{org_id}/{answer_key_id}/page-{nnn}.{ext}.
No PII in the key.

Validates: 1 ≤ files ≤ 20, image/* content_type, non-empty filename,
non-empty name. Tenant-scoped via user.organization_id.

Twelve unit tests cover all 4 endpoints across happy paths, validation
rejections, tenant scoping, and 404s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend assessment endpoint extensions + 2 tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/schemas/assessments.py` (extend create request + add answer_key field to detail response)
- Modify: `apps/api/src/grade_sight_api/routers/assessments.py` (POST validates answer_key; GET detail denormalizes answer_key)
- Modify: `apps/api/tests/routers/test_assessments_router.py` (add 2 tests)

- [ ] **Step 1: Extend Pydantic schemas**

In `apps/api/src/grade_sight_api/schemas/assessments.py`:

Find `AssessmentCreateRequest` and add the new optional fields:

```python
class AssessmentCreateRequest(BaseModel):
    student_id: UUID
    files: list[AssessmentFile]
    answer_key_id: UUID | None = None  # NEW
    already_graded: bool = False  # NEW
    review_all: bool = False  # NEW
```

Add a new schema for the embedded answer key on the detail response:

```python
class AssessmentDetailAnswerKey(BaseModel):
    id: UUID
    name: str
    page_count: int
```

Extend `AssessmentDetailResponse`:

```python
class AssessmentDetailResponse(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    status: AssessmentStatus
    uploaded_at: datetime
    pages: list[AssessmentDetailPage]
    diagnosis: AssessmentDiagnosisResponse | None
    answer_key: AssessmentDetailAnswerKey | None  # NEW
```

Extend `AssessmentDiagnosisResponse` with the new mode + count fields:

```python
class AssessmentDiagnosisResponse(BaseModel):
    id: UUID
    model: str
    overall_summary: str | None
    cost_usd: float
    latency_ms: int
    created_at: datetime
    problems: list[ProblemObservationResponse]
    analysis_mode: str  # NEW
    total_problems_seen: int | None  # NEW
```

- [ ] **Step 2: Update the assessments router**

In `apps/api/src/grade_sight_api/routers/assessments.py`:

Add `AnswerKey` and `AnswerKeyPage` to imports:

```python
from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
```

In `create_assessment`, after the existing validation block (after the student lookup + cross-org check), add answer key validation:

```python
    # Validate answer_key_id if provided
    if payload.answer_key_id is not None:
        key_result = await db.execute(
            select(AnswerKey).where(
                AnswerKey.id == payload.answer_key_id,
                AnswerKey.deleted_at.is_(None),
            )
        )
        answer_key = key_result.scalar_one_or_none()
        if answer_key is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="answer key not found",
            )
        if answer_key.organization_id != user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="answer key does not belong to your organization",
            )
```

Then in the Assessment construction, set the new fields:

```python
    assessment = Assessment(
        student_id=student.id,
        organization_id=user.organization_id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
        answer_key_id=payload.answer_key_id,  # NEW
        already_graded=payload.already_graded,  # NEW
        review_all=payload.review_all,  # NEW
    )
```

In `_build_diagnosis_response`, the diagnosis is loaded via `select(AssessmentDiagnosis).where(...)`. Add the new fields to the `AssessmentDiagnosisResponse(...)` construction:

```python
    return AssessmentDiagnosisResponse(
        id=diagnosis.id,
        model=diagnosis.model,
        overall_summary=diagnosis.overall_summary,
        cost_usd=float(diagnosis.cost_usd),
        latency_ms=diagnosis.latency_ms,
        created_at=diagnosis.created_at,
        problems=problems,
        analysis_mode=diagnosis.analysis_mode,
        total_problems_seen=diagnosis.total_problems_seen,
    )
```

In `get_assessment_detail`, before the final `return AssessmentDetailResponse(...)`, load the answer key summary if attached:

```python
    answer_key_payload: AssessmentDetailAnswerKey | None = None
    if assessment.answer_key_id is not None:
        ak_result = await db.execute(
            select(
                AnswerKey,
                func.count(AnswerKeyPage.id).label("page_count"),
            )
            .join(
                AnswerKeyPage,
                AnswerKeyPage.answer_key_id == AnswerKey.id,
                isouter=True,
            )
            .where(
                AnswerKey.id == assessment.answer_key_id,
                AnswerKeyPage.deleted_at.is_(None),
            )
            .group_by(AnswerKey.id)
        )
        ak_row = ak_result.one_or_none()
        if ak_row is not None:
            ak, page_count = ak_row
            answer_key_payload = AssessmentDetailAnswerKey(
                id=ak.id,
                name=ak.name,
                page_count=int(page_count or 0),
            )
```

Then update the return statement:

```python
    return AssessmentDetailResponse(
        id=assessment.id,
        student_id=assessment.student_id,
        student_name=student_name,
        status=assessment.status,
        uploaded_at=assessment.uploaded_at,
        pages=detail_pages,
        diagnosis=diagnosis_payload,
        answer_key=answer_key_payload,
    )
```

Add the import for the new schema:

```python
from ..schemas.assessments import (
    AssessmentCreateRequest,
    AssessmentCreateResponse,
    AssessmentDetailAnswerKey,  # NEW
    AssessmentDetailPage,
    AssessmentDetailResponse,
    AssessmentDiagnosisResponse,
    AssessmentListItem,
    AssessmentListResponse,
    AssessmentPageUploadIntent,
    ProblemObservationResponse,
)
```

- [ ] **Step 3: Add the 2 integration tests**

In `apps/api/tests/routers/test_assessments_router.py`, append at the bottom:

```python
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
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_assessments_router.py -v
```

Expected: all existing assessment router tests + 2 new ones PASS.

- [ ] **Step 5: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~89 prior + 2 new = ~91 passed, 2 skipped.

- [ ] **Step 6: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/schemas/assessments.py apps/api/src/grade_sight_api/routers/assessments.py apps/api/tests/routers/test_assessments_router.py
git commit -m "$(cat <<'EOF'
Wire answer_key + already_graded + review_all into assessment endpoints

POST /api/assessments accepts the three new optional fields and
stores them on the Assessment row. Cross-org answer_key_id rejection
returns 403; missing key returns 404.

GET /api/assessments/{id} response gains an embedded answer_key
summary (id, name, page_count) when the assessment has a key
attached. The diagnosis response gains analysis_mode and
total_problems_seen pass-through.

Two new integration tests cover the assessment-create path with
answer_key_id + already_graded set, and the cross-org key 403.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Engine service mode + prompt variants + 3 tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/engine_service.py`
- Modify: `apps/api/tests/services/test_engine_service.py` (add 3 tests)

- [ ] **Step 1: Update `engine_service.py`**

In `apps/api/src/grade_sight_api/services/engine_service.py`, replace the `_build_system_prompt` function with a mode-aware version. Find:

```python
async def _build_system_prompt(db: AsyncSession) -> str:
    cats_result = await db.execute(
```

Replace with the multi-mode version:

```python
async def _build_system_prompt(
    db: AsyncSession,
    *,
    mode: str,
    wrong_only: bool,
    student_page_count: int,
    key_page_count: int,
) -> str:
    cats_result = await db.execute(
        select(ErrorCategory)
        .options(
            selectinload(ErrorCategory.subcategories).selectinload(
                ErrorSubcategory.patterns
            ),
        )
        .order_by(ErrorCategory.severity_rank)
    )
    cats = cats_result.scalars().all()

    lines: list[str] = [
        "You are a math diagnostic assistant for Grade-Sight. You analyze "
        "handwritten student math work and identify mistakes.",
        "",
        "ERROR TAXONOMY:",
        "The following error patterns are organized into cognitive categories. "
        "When you classify an error, use the slug exactly as written.",
        "",
    ]
    for cat in cats:
        lines.append(f"## Category: {cat.name} (slug: {cat.slug})")
        lines.append(f"   Definition: {cat.definition}")
        lines.append(f"   Distinguishing marker: {cat.distinguishing_marker}")
        for sub in cat.subcategories:
            lines.append(f"   ### Subcategory: {sub.name} (slug: {sub.slug})")
            lines.append(f"       Definition: {sub.definition}")
            for pat in sub.patterns:
                if pat.deleted_at is not None:
                    continue
                lines.append(f"       - {pat.name} (slug: {pat.slug})")
                lines.append(f"         {pat.description}")
        lines.append("")

    if mode == "with_key":
        lines.append(
            f"INPUT LAYOUT: The first {student_page_count} images are "
            f"STUDENT WORK pages (1-{student_page_count}). The next "
            f"{key_page_count} images are the ANSWER KEY pages "
            f"(1-{key_page_count})."
        )
        lines.append("")
        lines.append(
            "INSTRUCTIONS:"
            "\nFor each problem on the student pages:"
            "\n1. Find the matching problem on the answer key."
            "\n2. Compare the student's answer to the answer key's answer."
            "\n3. If wrong: pick the best-matching error_pattern_slug from"
            " the taxonomy, write a 1-sentence error description, and"
            " provide a clear step-by-step solution."
        )
    elif mode == "already_graded":
        lines.append(
            "INPUT LAYOUT: The pages show student work that has been GRADED"
            " BY THE TEACHER. Look for the teacher's markings: red X marks,"
            " crossed-out answers, score deductions, '-N points' notations,"
            " comments like 'wrong' or 'incorrect' near a problem."
        )
        lines.append("")
        lines.append(
            "INSTRUCTIONS:"
            "\nFor each problem the teacher marked WRONG:"
            "\n1. Identify the problem statement and the student's work."
            "\n2. Determine the correct answer."
            "\n3. Classify the error against the taxonomy and provide a"
            " step-by-step solution."
        )
    else:  # auto_grade
        lines.append(
            "INSTRUCTIONS:"
            "\nFor each problem you find on the pages:"
            "\n1. Identify the problem statement and the student's complete"
            " work and final answer."
            "\n2. Solve the problem yourself to determine the correct answer."
            "\n3. Compare. If the student is wrong: pick the best-matching"
            " error_pattern_slug from the taxonomy, write a 1-sentence error"
            " description, and provide a clear step-by-step solution."
        )

    lines.append("")
    if wrong_only:
        lines.append(
            "OUTPUT FORMAT (return JSON only, no surrounding text). Output"
            " ONLY problems where the student got it wrong. Also report"
            " total_problems_seen as the count of problems you saw across"
            " all pages, including the correct ones you skipped:"
        )
    else:
        lines.append(
            "OUTPUT FORMAT (return JSON only, no surrounding text). Output"
            " ALL problems with the is_correct flag set:"
        )

    lines.extend([
        "{",
        '  "overall_summary": "string | null (1-2 sentences highest-level takeaway)",',
        '  "total_problems_seen": int | null (only required when wrong_only output)',
        '  "problems": [',
        "    {",
        '      "problem_number": int (1-indexed across all pages),',
        '      "page_number": int,',
        '      "student_answer": "string (the student\'s final answer)",',
        '      "correct_answer": "string (the correct answer)",',
        '      "is_correct": bool,',
        '      "error_pattern_slug": "string | null (taxonomy slug if wrong; null if correct or no pattern fits)",',
        '      "error_description": "string | null",',
        '      "solution_steps": "string | null"',
        "    }",
        "  ]",
        "}",
    ])
    return "\n".join(lines)
```

Update `_EngineOutput` to include the optional `total_problems_seen` field. Find:

```python
class _EngineOutput(BaseModel):
    overall_summary: str | None = None
    problems: list[_EngineProblem]
```

Replace with:

```python
class _EngineOutput(BaseModel):
    overall_summary: str | None = None
    total_problems_seen: int | None = None
    problems: list[_EngineProblem]
```

Now update `diagnose_assessment` to derive the mode + load key pages + pass through the prompt args. Replace the existing prompt-build + Claude call section:

Find:

```python
    # 3. Build prompt + presigned URLs.
    system_prompt = await _build_system_prompt(db)

    storage_ctx = CallContext(
```

Replace the entire block from there through to the storage of the diagnosis with:

```python
    # 3. Derive mode and load key pages if applicable.
    if assessment.answer_key_id is not None:
        mode = "with_key"
    elif assessment.already_graded:
        mode = "already_graded"
    else:
        mode = "auto_grade"

    wrong_only = (mode != "auto_grade") and (not assessment.review_all)

    key_pages: list[AnswerKeyPage] = []
    if mode == "with_key":
        key_result = await db.execute(
            select(AnswerKeyPage)
            .where(
                AnswerKeyPage.answer_key_id == assessment.answer_key_id,
                AnswerKeyPage.deleted_at.is_(None),
            )
            .order_by(AnswerKeyPage.page_number)
        )
        key_pages = list(key_result.scalars().all())
        if not key_pages:
            assessment.status = AssessmentStatus.failed
            await db.flush()
            raise EngineParseError("answer key has no pages")

    system_prompt = await _build_system_prompt(
        db,
        mode=mode,
        wrong_only=wrong_only,
        student_page_count=len(pages),
        key_page_count=len(key_pages),
    )

    storage_ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="diagnostic_engine_page_url",
        contains_pii=True,
        audit_reason="diagnostic engine reads assessment pages",
    )
    image_urls: list[bytes | str] = []
    for p in pages:
        url = await storage_service.get_download_url(
            ctx=storage_ctx, key=p.s3_url, db=db
        )
        image_urls.append(url)
    for kp in key_pages:
        url = await storage_service.get_download_url(
            ctx=storage_ctx, key=kp.s3_url, db=db
        )
        image_urls.append(url)

    # 4. Move to processing.
    assessment.status = AssessmentStatus.processing
    await db.flush()

    # 5. Call Claude.
    claude_ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="diagnostic_engine",
        contains_pii=True,
        audit_reason="diagnose student assessment",
    )
    start = time.monotonic()
    try:
        response = await claude_service.call_vision_multi(
            ctx=claude_ctx,
            model=MODEL,
            system=system_prompt,
            images=image_urls,
            prompt="Diagnose this assessment.",
            max_tokens=MAX_TOKENS,
            cache_system=True,
            db=db,
        )
    except ClaudeServiceError:
        assessment.status = AssessmentStatus.failed
        await db.flush()
        raise
    latency_ms = int((time.monotonic() - start) * 1000)

    # 6. Parse JSON.
    try:
        cleaned = _strip_markdown_fences(response.text)
        parsed_dict: Any = json.loads(cleaned)
        engine_output = _EngineOutput.model_validate(parsed_dict)
    except (json.JSONDecodeError, ValidationError) as exc:
        assessment.status = AssessmentStatus.failed
        await db.flush()
        logger.warning(
            "Engine response parse failure for assessment %s: %s",
            assessment.id, exc,
        )
        raise EngineParseError(f"Could not parse engine response: {exc}") from exc

    # 7. Compute cost from the call_vision_multi response.
    cost = claude_service.compute_cost(
        model=MODEL,
        tokens_input=response.tokens_input,
        tokens_output=response.tokens_output,
    )

    # 8. Persist diagnosis + observations.
    # Caller MUST wrap diagnose_assessment in one outer transaction so the
    # diagnosis + N observations + final status flush are atomic. Each flush
    # below stages SQL but does not commit; the endpoint's session boundary
    # is what makes the whole pipeline all-or-nothing.
    diagnosis = AssessmentDiagnosis(
        assessment_id=assessment.id,
        organization_id=user.organization_id,
        model=MODEL,
        prompt_version=PROMPT_VERSION,
        tokens_input=response.tokens_input,
        tokens_output=response.tokens_output,
        tokens_cache_read=response.tokens_cache_read,
        tokens_cache_creation=response.tokens_cache_creation,
        cost_usd=cost,
        latency_ms=latency_ms,
        overall_summary=engine_output.overall_summary,
        analysis_mode=mode,
        total_problems_seen=engine_output.total_problems_seen,
    )
    db.add(diagnosis)
    await db.flush()
```

Add the AnswerKeyPage import at the top of the file:

```python
from ..models.answer_key_page import AnswerKeyPage
```

- [ ] **Step 2: Add the 3 mode tests**

In `apps/api/tests/services/test_engine_service.py`, append at the bottom:

```python
# ---- Mode tests ----


async def test_diagnose_with_key_mode_includes_key_images_in_call(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    """Engine appends answer key pages to the image list and the prompt
    describes the layout. analysis_mode='with_key' on the diagnosis row."""
    from grade_sight_api.models.answer_key import AnswerKey
    from grade_sight_api.models.answer_key_page import AnswerKeyPage

    org, user, asmt = await _seed_assessment_with_pages(
        async_session, page_count=2
    )
    pattern = seed_minimal_taxonomy["pattern"]

    # Seed answer key + 1 page; attach to assessment
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=org.id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key.id,
            organization_id=org.id,
            page_number=1,
            s3_url=f"answer-keys/{org.id}/{key.id}/page-001.png",
            original_filename="key-1.png",
            content_type="image/png",
        )
    )
    asmt.answer_key_id = key.id
    await async_session.flush()

    fake_response = ClaudeVisionResponse(
        text=json.dumps({
            "overall_summary": "1 wrong of 5 seen.",
            "total_problems_seen": 5,
            "problems": [
                {
                    "problem_number": 1,
                    "page_number": 1,
                    "student_answer": "x = 5",
                    "correct_answer": "x = 7",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "wrong",
                    "solution_steps": "step",
                }
            ],
        }),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )

    captured_kwargs: dict = {}

    async def _capture(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_response

    with patch.object(claude_service, "call_vision_multi", new=_capture):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    # 2 student pages + 1 key page = 3 images
    assert len(captured_kwargs["images"]) == 3
    # System prompt mentions answer key layout
    assert "ANSWER KEY" in captured_kwargs["system"]
    assert "STUDENT WORK" in captured_kwargs["system"]

    # Diagnosis stamped with mode
    diag = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalar_one()
    assert diag.analysis_mode == "with_key"
    assert diag.total_problems_seen == 5


async def test_diagnose_already_graded_mode_uses_markings_prompt(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    """already_graded=true with no answer_key_id selects the markings prompt."""
    org, user, asmt = await _seed_assessment_with_pages(async_session)
    asmt.already_graded = True
    await async_session.flush()
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=json.dumps({
            "overall_summary": "graded",
            "total_problems_seen": 4,
            "problems": [
                {
                    "problem_number": 2,
                    "page_number": 1,
                    "student_answer": "5",
                    "correct_answer": "7",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "wrong",
                    "solution_steps": "step",
                }
            ],
        }),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )

    captured_kwargs: dict = {}

    async def _capture(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_response

    with patch.object(claude_service, "call_vision_multi", new=_capture):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    # Prompt mentions teacher markings
    system = captured_kwargs["system"]
    assert "GRADED BY THE TEACHER" in system
    assert "red X" in system or "score deductions" in system

    diag = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalar_one()
    assert diag.analysis_mode == "already_graded"


async def test_diagnose_wrong_only_stores_only_wrong_observations_with_total(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    """When wrong_only is active, engine response of 4 wrong out of 18 stores
    4 ProblemObservation rows + total_problems_seen=18 on the diagnosis."""
    org, user, asmt = await _seed_assessment_with_pages(async_session)
    asmt.already_graded = True
    asmt.review_all = False
    await async_session.flush()
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=json.dumps({
            "overall_summary": "4 wrong of 18.",
            "total_problems_seen": 18,
            "problems": [
                {
                    "problem_number": n,
                    "page_number": 1,
                    "student_answer": f"wrong-{n}",
                    "correct_answer": f"right-{n}",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "wrong",
                    "solution_steps": "step",
                }
                for n in (3, 7, 12, 15)
            ],
        }),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )

    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    obs_rows = (
        await async_session.execute(
            select(ProblemObservation).order_by(
                ProblemObservation.problem_number
            )
        )
    ).scalars().all()
    assert len(obs_rows) == 4
    assert all(o.is_correct is False for o in obs_rows)

    diag = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalar_one()
    assert diag.total_problems_seen == 18
```

- [ ] **Step 3: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/services/test_engine_service.py -v
```

Expected: existing 8 tests + 3 new ones PASS.

- [ ] **Step 4: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~91 prior + 3 new = ~94 passed, 2 skipped.

- [ ] **Step 5: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/services/engine_service.py apps/api/tests/services/test_engine_service.py
git commit -m "$(cat <<'EOF'
Add engine modes (auto_grade / with_key / already_graded)

engine_service.diagnose_assessment now derives the mode from
Assessment.answer_key_id and Assessment.already_graded:
  with_key: answer_key_id set
  already_graded: no key, already_graded=true
  auto_grade: neither (Spec 11 default)

wrong_only output is the default for the two graded modes (key/markings
provide cheap grading); review_all=true overrides to full output.
auto_grade always returns full output.

System prompt has three branches: with_key explicitly labels the
student/key image layout; already_graded prompts Claude to read red X
marks + score deductions; auto_grade is unchanged. Output format
section adapts: wrong_only requests total_problems_seen alongside the
filtered observations list.

For with_key mode, AnswerKeyPage rows are loaded and appended to the
image list passed to call_vision_multi.

AssessmentDiagnosis row stamps analysis_mode + total_problems_seen.

Three new tests verify: with_key includes key images + correct prompt;
already_graded uses markings prompt; wrong_only stores only wrong
observations with total_problems_seen set.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend types + actions + lib/api updates

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/actions.ts`
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Update `lib/types.ts`**

Add these types to `apps/web/lib/types.ts` (after the existing AssessmentDetail section):

```ts
// ---- Answer keys ----

export interface AnswerKey {
  id: string;
  name: string;
  page_count: number;
  first_page_thumbnail_url: string;
  created_at: string;
}

export interface AnswerKeyDetailPage {
  page_number: number;
  original_filename: string;
  view_url: string;
}

export interface AnswerKeyDetail {
  id: string;
  name: string;
  created_at: string;
  pages: AnswerKeyDetailPage[];
}

export interface AnswerKeyPageUploadIntent {
  page_number: number;
  key: string;
  upload_url: string;
}

export interface AnswerKeyUploadIntent {
  answer_key_id: string;
  pages: AnswerKeyPageUploadIntent[];
}

export interface AssessmentDetailAnswerKey {
  id: string;
  name: string;
  page_count: number;
}
```

Update the existing `AssessmentDiagnosis` interface to add the new fields:

```ts
export interface AssessmentDiagnosis {
  id: string;
  model: string;
  overall_summary: string | null;
  cost_usd: number;
  latency_ms: number;
  created_at: string;
  problems: ProblemObservation[];
  analysis_mode: "auto_grade" | "with_key" | "already_graded";  // NEW
  total_problems_seen: number | null;  // NEW
}
```

Update `AssessmentDetail` to include the answer key:

```ts
export interface AssessmentDetail {
  id: string;
  student_id: string;
  student_name: string;
  status: AssessmentStatus;
  uploaded_at: string;
  pages: AssessmentDetailPage[];
  diagnosis: AssessmentDiagnosis | null;
  answer_key: AssessmentDetailAnswerKey | null;  // NEW
}
```

- [ ] **Step 2: Update `lib/actions.ts`**

Add the `AnswerKey` types to the import:

```ts
import type {
  AnswerKey,
  AnswerKeyUploadIntent,
  AssessmentUploadIntent,
  Student,
} from "./types";
```

Add the new actions at the bottom of the file:

```ts
export async function createAnswerKeyForUpload(input: {
  name: string;
  files: { filename: string; content_type: string }[];
}): Promise<AnswerKeyUploadIntent> {
  const response = await callApi(`/api/answer-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/answer-keys failed: ${response.status}`);
  }
  return (await response.json()) as AnswerKeyUploadIntent;
}

export async function deleteAnswerKey(id: string): Promise<void> {
  const response = await callApi(`/api/answer-keys/${id}`, {
    method: "DELETE",
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw new Error(`DELETE /api/answer-keys/${id} failed: ${response.status}`);
  }
}
```

Update `createAssessmentForUpload` to take the new optional fields:

```ts
export async function createAssessmentForUpload(input: {
  student_id: string;
  files: { filename: string; content_type: string }[];
  answer_key_id?: string;
  already_graded?: boolean;
  review_all?: boolean;
}): Promise<AssessmentUploadIntent> {
  const response = await callApi(`/api/assessments`, {
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

- [ ] **Step 3: Update `lib/api.ts`**

Add the `fetchAnswerKeys` server-side helper. Open `apps/web/lib/api.ts`. Add `AnswerKey` to the type imports:

```ts
import type {
  AnswerKey,
  AssessmentDetail,
  AssessmentListItem,
  AssessmentUploadIntent,
  EntitlementResponse,
  Student,
} from "./types";
```

Add to the type re-export block:

```ts
export type {
  AnswerKey,
  AssessmentDetail,
  AssessmentListItem,
  AssessmentStatus,
  AssessmentUploadIntent,
  EntitlementResponse,
  Student,
} from "./types";
```

Add the new function at the bottom of the file:

```ts
export async function fetchAnswerKeys(): Promise<AnswerKey[]> {
  const response = await authedFetch(`/api/answer-keys`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/answer-keys failed: ${response.status}`);
  const body = (await response.json()) as { answer_keys: AnswerKey[] };
  return body.answer_keys;
}
```

- [ ] **Step 4: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean (only the 2 pre-existing warnings stay).

- [ ] **Step 5: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/lib/types.ts apps/web/lib/actions.ts apps/web/lib/api.ts
git commit -m "$(cat <<'EOF'
Add answer-key types + actions + fetcher

New types in lib/types.ts: AnswerKey, AnswerKeyDetail,
AnswerKeyUploadIntent, AnswerKeyPageUploadIntent,
AnswerKeyDetailPage, AssessmentDetailAnswerKey. AssessmentDiagnosis
gains analysis_mode + total_problems_seen. AssessmentDetail gains
answer_key field.

New server actions: createAnswerKeyForUpload, deleteAnswerKey.
createAssessmentForUpload extended with answer_key_id, already_graded,
review_all optional fields.

New server fetcher: fetchAnswerKeys (used by /upload page server
component to populate the picker).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: AnswerKeyUploadForm + AnswerKeyPicker components

**Files:**
- Create: `apps/web/components/answer-key-upload-form.tsx`
- Create: `apps/web/components/answer-key-picker.tsx`

- [ ] **Step 1: Create `AnswerKeyUploadForm`**

Create `apps/web/components/answer-key-upload-form.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { AnswerKey } from "@/lib/types";
import { createAnswerKeyForUpload } from "@/lib/actions";
import { runWithConcurrency } from "@/lib/upload-queue";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 20;
const PUT_CONCURRENCY = 4;
const MAX_RETRIES = 2;

interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;
}

export interface AnswerKeyUploadFormProps {
  onCreated: (key: AnswerKey) => void;
  onCancel?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AnswerKeyUploadForm({
  onCreated,
  onCancel,
}: AnswerKeyUploadFormProps) {
  const [name, setName] = useState("");
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  const stagedRef = useRef<StagedFile[]>([]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  useEffect(() => {
    return () => {
      stagedRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  const totalSize = useMemo(
    () => staged.reduce((sum, s) => sum + s.file.size, 0),
    [staged],
  );

  function appendFiles(incoming: FileList | File[]): void {
    setError(null);
    const list = Array.from(incoming);
    const accepted: File[] = [];
    for (const f of list) {
      if (!f.type.startsWith("image/")) {
        setError(`"${f.name}" is not an image`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" is larger than 10 MB`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    setStaged((prev) => {
      const merged = [...prev];
      for (const f of accepted) {
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        if (
          merged.some(
            (s) => `${s.file.name}-${s.file.size}-${s.file.lastModified}` === key,
          )
        )
          continue;
        merged.push({
          id: key,
          file: f,
          previewUrl: URL.createObjectURL(f),
        });
      }
      if (merged.length > MAX_PAGES) {
        setError(`Max ${MAX_PAGES} pages per answer key`);
        for (const s of merged.slice(MAX_PAGES)) URL.revokeObjectURL(s.previewUrl);
        merged.length = MAX_PAGES;
      }
      merged.sort((a, b) => a.file.name.localeCompare(b.file.name));
      return merged;
    });
  }

  function removeStaged(id: string): void {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  async function uploadAll(): Promise<void> {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (staged.length === 0) {
      setError("Pick at least one file");
      return;
    }

    const intent = await createAnswerKeyForUpload({
      name: name.trim(),
      files: staged.map((s) => ({
        filename: s.file.name,
        content_type: s.file.type,
      })),
    });

    const pairs = staged.map((s, i) => {
      const page = intent.pages[i];
      if (!page) {
        throw new Error("Server returned fewer upload URLs than files");
      }
      return { staged: s, intent: page };
    });

    setProgress({ done: 0, total: pairs.length });

    let attempt = 0;
    let unfinished = pairs;

    while (attempt <= MAX_RETRIES && unfinished.length > 0) {
      const outcomes = await runWithConcurrency(
        unfinished,
        PUT_CONCURRENCY,
        async (pair) => {
          // TODO(spec-cleanup): R2 PUT failure leaves orphan key — pending detector spec
          const res = await fetch(pair.intent.upload_url, {
            method: "PUT",
            body: pair.staged.file,
            headers: { "Content-Type": pair.staged.file.type },
          });
          if (!res.ok) {
            throw new Error(`R2 PUT failed: ${res.status}`);
          }
          setProgress((p) => p && { done: p.done + 1, total: p.total });
        },
      );
      const failed = unfinished.filter((_, i) => !outcomes[i]?.ok);
      if (failed.length === 0) {
        // Notify parent picker so the new key can be auto-selected.
        onCreated({
          id: intent.answer_key_id,
          name: name.trim(),
          page_count: pairs.length,
          first_page_thumbnail_url: pairs[0]?.staged.previewUrl ?? "",
          created_at: new Date().toISOString(),
        });
        return;
      }
      unfinished = failed;
      attempt += 1;
    }

    setError(
      `${pairs.length - unfinished.length} of ${pairs.length} pages uploaded — please try again or remove the failing files.`,
    );
    setProgress(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    startTransition(async () => {
      try {
        await uploadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-6 space-y-5"
    >
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
        Uploading an answer key noticeably improves grading accuracy.
        Recommended whenever you have one.
      </p>

      <div>
        <label
          htmlFor="answer-key-name"
          className="block text-sm text-ink-soft"
        >
          Answer key name
        </label>
        <input
          id="answer-key-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Algebra 1 Chapter 7 Quiz Key"
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          disabled={isPending}
          required
        />
      </div>

      <div>
        <label className="block text-sm text-ink-soft" htmlFor="key-files">
          Key pages (image, max 10 MB each, up to 20 pages)
        </label>
        <div
          className={`mt-1 rounded-[var(--radius-sm)] border-2 border-dashed p-6 text-center transition-colors ${
            isDragging ? "border-accent bg-accent-soft" : "border-rule bg-paper"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) {
              appendFiles(e.dataTransfer.files);
            }
          }}
        >
          <p className="text-base text-ink-soft">Drop key pages here, or</p>
          <label
            htmlFor="key-files"
            className="mt-2 inline-block cursor-pointer rounded-[var(--radius-sm)] border border-rule bg-paper-soft px-4 py-2 text-sm text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-accent"
          >
            click to browse
          </label>
          <input
            id="key-files"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) appendFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {staged.length > 0 && (
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            {staged.length} {staged.length === 1 ? "page" : "pages"} staged · {formatBytes(totalSize)}
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {staged.map((s, i) => (
              <li
                key={s.id}
                className="relative rounded-[var(--radius-sm)] border border-rule bg-paper p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not optimizable */}
                <img
                  src={s.previewUrl}
                  alt={s.file.name}
                  className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
                />
                <p className="mt-1 truncate text-xs text-ink">{s.file.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                  Page {i + 1} · {formatBytes(s.file.size)}
                </p>
                <button
                  type="button"
                  aria-label={`Remove page ${i + 1}`}
                  onClick={() => removeStaged(s.id)}
                  disabled={isPending}
                  className="absolute right-1 top-1 rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Uploading {progress.done} of {progress.total}…
        </p>
      )}
      {error && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isPending || staged.length === 0 || !name.trim()}
        >
          {isPending
            ? `Uploading ${progress?.done ?? 0} of ${progress?.total ?? staged.length}…`
            : `Save answer key (${staged.length} ${staged.length === 1 ? "page" : "pages"})`}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `AnswerKeyPicker`**

Create `apps/web/components/answer-key-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AnswerKeyUploadForm } from "@/components/answer-key-upload-form";
import type { AnswerKey } from "@/lib/types";
import { deleteAnswerKey } from "@/lib/actions";

export interface AnswerKeyPickerProps {
  keys: AnswerKey[];
  value: string | null;
  onChange: (id: string | null) => void;
}

export function AnswerKeyPicker({
  keys: initialKeys,
  value,
  onChange,
}: AnswerKeyPickerProps) {
  const [keys, setKeys] = useState<AnswerKey[]>(initialKeys);
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = keys.filter((k) =>
    k.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const selected = keys.find((k) => k.id === value) ?? null;

  function handleCreated(newKey: AnswerKey): void {
    setKeys((prev) => [newKey, ...prev]);
    onChange(newKey.id);
    setIsAdding(false);
  }

  function handleDelete(id: string): void {
    if (!window.confirm("Delete this answer key? This cannot be undone.")) {
      return;
    }
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteAnswerKey(id);
        setKeys((prev) => prev.filter((k) => k.id !== id));
        if (value === id) {
          onChange(null);
        }
      } catch {
        window.alert("Could not delete — please try again.");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div>
      {selected ? (
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-rule bg-paper p-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL */}
            <img
              src={selected.first_page_thumbnail_url}
              alt={`First page of ${selected.name}`}
              className="size-12 shrink-0 rounded-[var(--radius-sm)] border border-rule-soft object-cover"
            />
            <div>
              <p className="text-base text-ink">{selected.name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                {selected.page_count}{" "}
                {selected.page_count === 1 ? "page" : "pages"} · selected
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Change
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-mute">
          (none — recommended for accuracy)
        </p>
      )}

      <div className="mt-3 space-y-2">
        {!selected && keys.length > 0 && !isAdding && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search answer keys…"
            className="w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        )}
        {!selected && filtered.length > 0 && !isAdding && (
          <ul className="divide-y divide-rule-soft rounded-[var(--radius-sm)] border border-rule">
            {filtered.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-paper-soft"
              >
                <button
                  type="button"
                  onClick={() => onChange(k.id)}
                  className="flex flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL */}
                  <img
                    src={k.first_page_thumbnail_url}
                    alt={`First page of ${k.name}`}
                    className="size-12 shrink-0 rounded-[var(--radius-sm)] border border-rule-soft object-cover"
                  />
                  <div>
                    <p className="text-base text-ink">{k.name}</p>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                      {k.page_count}{" "}
                      {k.page_count === 1 ? "page" : "pages"}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${k.name}`}
                  onClick={() => handleDelete(k.id)}
                  disabled={deletingId === k.id}
                  className="rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {isAdding ? (
          <AnswerKeyUploadForm
            onCreated={handleCreated}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          !selected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
            >
              + Upload new key
            </Button>
          )
        )}
      </div>
    </div>
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
git add apps/web/components/answer-key-upload-form.tsx apps/web/components/answer-key-picker.tsx
git commit -m "$(cat <<'EOF'
Add AnswerKeyUploadForm + AnswerKeyPicker components

AnswerKeyUploadForm mirrors AssessmentUploadForm: drop zone +
multi-file picker, alphabetical sort, parallel R2 PUT (concurrency 4,
2 retries), 10 MB / 20-page caps. Includes the "Uploading an answer
key noticeably improves grading accuracy" note at the top. On success,
calls onCreated(answerKey) so the parent picker can auto-select the
new key.

AnswerKeyPicker is the inline picker mirror of StudentPicker: search,
list with thumbnails + per-row × delete, "+ Upload new key" expands
inline to AnswerKeyUploadForm. Selected state shows a pinned card
with thumbnail + "Change" button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: AssessmentUploadForm wiring + /upload page

**Files:**
- Modify: `apps/web/components/assessment-upload-form.tsx`
- Modify: `apps/web/app/upload/page.tsx`

- [ ] **Step 1: Update `/upload` page to fetch keys**

Modify `apps/web/app/upload/page.tsx`. Find the existing imports + `Promise.all` block. Replace with:

```tsx
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AssessmentUploadForm } from "@/components/assessment-upload-form";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchAnswerKeys, fetchMe, fetchStudents } from "@/lib/api";

export default async function UploadPage() {
  const [user, students, answerKeys] = await Promise.all([
    fetchMe(),
    fetchStudents(),
    fetchAnswerKeys(),
  ]);
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
          Pick a student and upload a photo of their work. Grade Sight will
          diagnose the error patterns once the assessment processes.
        </p>
        <AssessmentUploadForm
          initialStudents={students}
          initialAnswerKeys={answerKeys}
          userRole={user.role === "teacher" ? "teacher" : "parent"}
        />
      </PageContainer>
    </AppShell>
  );
}
```

- [ ] **Step 2: Update `AssessmentUploadForm`**

Open `apps/web/components/assessment-upload-form.tsx`. Update the props interface + add new state for the answer key picker, already-graded checkbox, review-all checkbox, and role-based prominence.

Find the existing `AssessmentUploadFormProps`:

```ts
export interface AssessmentUploadFormProps {
  initialStudents: Student[];
}
```

Replace with:

```ts
import type { AnswerKey, Student } from "@/lib/types";
import { AnswerKeyPicker } from "@/components/answer-key-picker";

export interface AssessmentUploadFormProps {
  initialStudents: Student[];
  initialAnswerKeys: AnswerKey[];
  userRole: "teacher" | "parent";
}
```

(Replace the existing `import type { Student } from "@/lib/types";` with the combined import above.)

In the function signature, destructure the new props:

```tsx
export function AssessmentUploadForm({
  initialStudents,
  initialAnswerKeys,
  userRole,
}: AssessmentUploadFormProps) {
```

Add new state hooks alongside the existing ones (right after the existing `const [students, setStudents] = ...`):

```tsx
  const [answerKeyId, setAnswerKeyId] = useState<string | null>(null);
  const [alreadyGraded, setAlreadyGraded] = useState<boolean>(false);
  const [reviewAll, setReviewAll] = useState<boolean>(false);
```

Update the `createAssessmentForUpload` call inside `uploadAll`. Find:

```tsx
    const intent = await createAssessmentForUpload({
      student_id: studentId,
      files: staged.map((s) => ({
        filename: s.file.name,
        content_type: s.file.type,
      })),
    });
```

Replace with:

```tsx
    const intent = await createAssessmentForUpload({
      student_id: studentId,
      files: staged.map((s) => ({
        filename: s.file.name,
        content_type: s.file.type,
      })),
      answer_key_id: answerKeyId ?? undefined,
      already_graded: alreadyGraded,
      review_all: reviewAll,
    });
```

Now update the JSX. Find the existing `<form ...>` block. Replace the entire form body to include the answer key picker + checkboxes, with role-based prominence:

```tsx
  const isTeacher = userRole === "teacher";
  const showReviewAll = answerKeyId !== null || alreadyGraded;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StudentPicker
        students={students}
        value={studentId}
        onChange={setStudentId}
        onStudentAdded={handleStudentAdded}
      />

      {/* Teacher's primary surface: answer key picker prominent */}
      {isTeacher && (
        <div>
          <p className="mb-2 text-sm text-ink-soft font-medium">
            Answer key (recommended)
          </p>
          <AnswerKeyPicker
            keys={initialAnswerKeys}
            value={answerKeyId}
            onChange={setAnswerKeyId}
          />
        </div>
      )}

      <div>
        <label className="block text-sm text-ink-soft" htmlFor="page-files">
          Quiz pages (image, max 10 MB each, up to 20 pages)
        </label>
        <div
          className={`mt-1 rounded-[var(--radius-sm)] border-2 border-dashed p-6 text-center transition-colors ${
            isDragging ? "border-accent bg-accent-soft" : "border-rule bg-paper"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) {
              appendFiles(e.dataTransfer.files);
            }
          }}
        >
          <p className="text-base text-ink-soft">Drop quiz pages here, or</p>
          <label
            htmlFor="page-files"
            className="mt-2 inline-block cursor-pointer rounded-[var(--radius-sm)] border border-rule bg-paper-soft px-4 py-2 text-sm text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-accent"
          >
            click to browse
          </label>
          <input
            id="page-files"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) appendFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {staged.length > 0 && (
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            {staged.length} {staged.length === 1 ? "page" : "pages"} staged · {formatBytes(totalSize)}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {staged.map((s, i) => (
              <li
                key={s.id}
                className="relative rounded-[var(--radius-sm)] border border-rule bg-paper p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                <img
                  src={s.previewUrl}
                  alt={s.file.name}
                  className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
                />
                <p className="mt-1 truncate text-xs text-ink">{s.file.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                  Page {i + 1} · {formatBytes(s.file.size)}
                </p>
                <button
                  type="button"
                  aria-label={`Remove page ${i + 1}`}
                  onClick={() => removeStaged(s.id)}
                  disabled={isPending}
                  className="absolute right-1 top-1 rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Parent's primary surface: already-graded checkbox prominent */}
      {!isTeacher && (
        <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-rule bg-paper p-4 hover:bg-paper-soft cursor-pointer">
          <input
            type="checkbox"
            checked={alreadyGraded}
            onChange={(e) => setAlreadyGraded(e.target.checked)}
            disabled={isPending}
            className="mt-1"
          />
          <div>
            <p className="text-base text-ink">
              This paper is already graded by the teacher
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Grade-Sight will read the teacher&apos;s red marks instead of
              re-grading from scratch (faster + cheaper).
            </p>
          </div>
        </label>
      )}

      {/* Teacher's secondary surface: small checkbox */}
      {isTeacher && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={alreadyGraded}
            onChange={(e) => setAlreadyGraded(e.target.checked)}
            disabled={isPending}
          />
          <span>This paper is already graded by the teacher</span>
        </label>
      )}

      {/* Parent's secondary surface: small answer-key picker */}
      {!isTeacher && (
        <details className="rounded-[var(--radius-sm)] border border-rule-soft bg-paper-soft p-3">
          <summary className="cursor-pointer text-sm text-ink-soft">
            I have an answer key (optional)
          </summary>
          <div className="mt-3">
            <AnswerKeyPicker
              keys={initialAnswerKeys}
              value={answerKeyId}
              onChange={setAnswerKeyId}
            />
          </div>
        </details>
      )}

      {/* Review-all override (only when key or graded set) */}
      {showReviewAll && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={reviewAll}
            onChange={(e) => setReviewAll(e.target.checked)}
            disabled={isPending}
          />
          <span>
            Review all problems (default: show only the wrong ones)
          </span>
        </label>
      )}

      {progress && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Uploading {progress.done} of {progress.total}…
        </p>
      )}
      {error && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending || !studentId || staged.length === 0}
      >
        {isPending
          ? `Uploading ${progress?.done ?? 0} of ${progress?.total ?? staged.length}…`
          : `Upload ${staged.length === 0 ? "assessment" : staged.length === 1 ? "1 page" : `${staged.length} pages`}`}
      </Button>
    </form>
  );
}
```

(The rest of the component — `appendFiles`, `removeStaged`, `handleStudentAdded`, `uploadAll`, `handleSubmit`, all the state hooks — stays the same.)

- [ ] **Step 3: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/components/assessment-upload-form.tsx apps/web/app/upload/page.tsx
git commit -m "$(cat <<'EOF'
Wire AnswerKeyPicker + already-graded into AssessmentUploadForm

The /upload page server-fetches answer keys alongside students and
the user. Form props gain initialAnswerKeys + userRole.

Form layout adapts by role:
- Teacher: AnswerKeyPicker prominent at top with "Answer key
  (recommended)" heading; "already graded" is a small secondary
  checkbox below the file picker.
- Parent: "Already graded by teacher" prominent below the file picker
  with explanatory copy; AnswerKeyPicker hidden behind a "I have an
  answer key (optional)" disclosure.

When either an answer key is selected OR already-graded is checked,
a "Review all problems" override checkbox appears (default: show
only the wrong ones).

createAssessmentForUpload call passes answer_key_id, already_graded,
review_all through to the backend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Detail page mode badge + DiagnosisDisplay framing

**Files:**
- Modify: `apps/web/app/assessments/[id]/page.tsx`
- Modify: `apps/web/components/diagnosis-display.tsx`

- [ ] **Step 1: Add mode badge to the detail page header**

In `apps/web/app/assessments/[id]/page.tsx`, find the metadata `<div>` block that renders "Uploaded {time-ago} · status badge · N pages". Add the mode badge after it. Replace the metadata div with:

```tsx
        <div className="mb-10 flex flex-wrap items-center gap-x-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          <span>Uploaded {timeAgo(detail.uploaded_at)}</span>
          <span aria-hidden="true">·</span>
          <Badge
            variant="secondary"
            className="font-mono uppercase tracking-[0.12em]"
          >
            {STATUS_LABEL[detail.status]}
          </Badge>
          <span aria-hidden="true">·</span>
          <span>
            {detail.pages.length}{" "}
            {detail.pages.length === 1 ? "page" : "pages"}
          </span>
          {detail.diagnosis && (
            <>
              <span aria-hidden="true">·</span>
              <ModeBadge
                mode={detail.diagnosis.analysis_mode}
                answerKey={detail.answer_key}
              />
            </>
          )}
        </div>
```

Add the `ModeBadge` helper component at the bottom of the same file (just before the closing of the file):

```tsx
function ModeBadge({
  mode,
  answerKey,
}: {
  mode: "auto_grade" | "with_key" | "already_graded";
  answerKey: { id: string; name: string; page_count: number } | null;
}) {
  const label =
    mode === "auto_grade"
      ? "Auto-graded"
      : mode === "already_graded"
        ? "Reading teacher markings"
        : answerKey
          ? `Graded with ${answerKey.name}`
          : "Graded with answer key";

  return (
    <Badge
      variant="secondary"
      className="font-mono uppercase tracking-[0.12em]"
    >
      {label}
    </Badge>
  );
}
```

- [ ] **Step 2: Update `DiagnosisDisplay` for total_problems_seen framing**

Open `apps/web/components/diagnosis-display.tsx`. Find the existing eyebrow at the top:

```tsx
      <SectionEyebrow>Diagnostic results</SectionEyebrow>
```

Replace with a conditional eyebrow that shows the "X of Y problems need review" framing when `total_problems_seen` is set:

```tsx
      <SectionEyebrow>
        {diagnosis.total_problems_seen != null && diagnosis.problems.length > 0
          ? `${diagnosis.problems.length} of ${diagnosis.total_problems_seen} problems need review`
          : diagnosis.total_problems_seen != null && diagnosis.problems.length === 0
            ? `All ${diagnosis.total_problems_seen} problems correct`
            : "Diagnostic results"}
      </SectionEyebrow>
```

The `Diagnostic results` fallback is for `auto_grade` mode (no `total_problems_seen`).

- [ ] **Step 3: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/app/assessments/[id]/page.tsx apps/web/components/diagnosis-display.tsx
git commit -m "$(cat <<'EOF'
Show mode badge + N-of-M framing on assessment detail page

The /assessments/[id] header now appends a mode badge after the
existing time-ago / status / page-count line:
- "Auto-graded" — no key, no markings
- "Graded with [Key Name]" — with_key mode (clickable info from the
  embedded answer_key in the GET response)
- "Reading teacher markings" — already_graded mode

DiagnosisDisplay's eyebrow shows "X of Y problems need review" when
total_problems_seen is set (wrong-only mode ran), or "All Y problems
correct" if 0 wrongs were found, or the legacy "Diagnostic results"
for auto_grade mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke test + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Confirm dev server is running**

If `pnpm dev` isn't already running from prior smoke tests, start it. The api worker should hot-reload on the model + service changes; the web worker should hot-reload on the component changes.

- [ ] **Step 2: Smoke 1 — answer key creation + with_key mode**

In a browser at http://localhost:3000:

1. Sign in as a teacher.
2. Navigate to `/upload`. Confirm the **Answer key (recommended)** picker is prominent at top (teacher prominence).
3. Click "+ Upload new key". The picker expands to `AnswerKeyUploadForm`.
4. Fill name "Algebra Quiz 1 Key", drop 2 PNG pages, click "Save answer key". Expected: parallel PUT runs ~5s, picker auto-selects the new key, "Change" button appears.
5. Pick a student.
6. Drop 5 PNG pages of an ungraded quiz.
7. Click "Upload …". Expected: redirect to `/assessments/<id>`.
8. On detail page, confirm the mode badge reads "**Graded with Algebra Quiz 1 Key**".
9. Click "Run diagnostic". Wait ~30-40s.
10. Expected: detail page re-renders. Diagnosis eyebrow reads "**X of Y problems need review**" (wrong-only is the default for `with_key`). Only wrong problems shown.

- [ ] **Step 3: Smoke 2 — already_graded mode**

1. Navigate back to `/upload`.
2. Use the same student, drop 5 PNG pages of a **graded** quiz (with teacher's red marks).
3. Confirm the "**Already graded by teacher**" checkbox is below the file picker (teacher view) — check it.
4. Don't pick an answer key. Click Upload.
5. On detail page, mode badge should read "**Reading teacher markings**".
6. Click "Run diagnostic". ~30s.
7. Expected: diagnosis eyebrow "X of Y problems need review"; only the problems with red X's classified.

- [ ] **Step 4: Smoke 3 — review_all override**

1. Upload another quiz with answer key attached.
2. Before Submit, check the "**Review all problems**" override checkbox.
3. Submit + run diagnostic.
4. Expected: diagnosis includes ALL problems (correct + wrong), eyebrow reads the legacy "**Diagnostic results**" or similar (since `total_problems_seen` may be null or `problems.length == total_problems_seen`).

- [ ] **Step 5: Smoke 4 — delete answer key**

1. Navigate to `/upload`. Click on the AnswerKeyPicker.
2. Click × on the "Algebra Quiz 1 Key".
3. Confirm dialog → confirm. Key disappears from the list.
4. Navigate to the prior assessment (`/assessments/<id>` with that key attached).
5. Confirm the diagnosis still renders correctly — the FK still resolves through `deleted_at`.

- [ ] **Step 6: Verify DB state**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run python -c "
import asyncio
from grade_sight_api.db import async_session_factory
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.answer_key_page import AnswerKeyPage
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from sqlalchemy import select, func

async def check():
    async with async_session_factory() as s:
        ak_count = (await s.execute(select(func.count(AnswerKey.id)))).scalar()
        akp_count = (await s.execute(select(func.count(AnswerKeyPage.id)))).scalar()
        modes = (await s.execute(
            select(AssessmentDiagnosis.analysis_mode, func.count(AssessmentDiagnosis.id))
            .group_by(AssessmentDiagnosis.analysis_mode)
        )).all()
        print(f'AnswerKeys: {ak_count}')
        print(f'AnswerKeyPages: {akp_count}')
        print(f'Diagnoses by mode:')
        for mode, count in modes:
            print(f'  {mode}: {count}')

asyncio.run(check())
"
```

Expected: at least 1 AnswerKey + 2 pages, and the new diagnoses show `with_key`, `already_graded`, `auto_grade` distributed across the modes you smoked.

- [ ] **Step 7: Update `CLAUDE.md`**

Open `CLAUDE.md`. Find the phase line:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), 9 (assessment upload UI shell), 10 (multi-page assessment upload), and 11 (diagnostic engine v1) complete. Next: answer key upload (Spec 12).
```

Replace with:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), 9 (assessment upload UI shell), 10 (multi-page assessment upload), 11 (diagnostic engine v1), and 12 (answer key + engine modes) complete. Next: printable corrections PDF (Spec 13).
```

- [ ] **Step 8: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Mark Spec 12 (answer key + engine modes) complete in CLAUDE.md

Spec 12 acceptance done end-to-end:
- answer_keys + answer_key_pages tables (Spec 2 refactored to multi-page).
- POST/GET/DELETE /api/answer-keys (CRUD, mirror of assessments router).
- Assessment endpoint extension: answer_key_id + already_graded +
  review_all flags pass through; GET detail embeds answer_key summary.
- engine_service derives 3 modes (auto_grade / with_key /
  already_graded) and emits 3 prompt variants. wrong_only is the
  default for graded modes; review_all overrides to full output.
  total_problems_seen + analysis_mode persisted on every diagnosis.
- AnswerKeyUploadForm + AnswerKeyPicker components.
- /upload form: AnswerKey picker + already-graded checkbox + review-all
  override, with role-based prominence.
- /assessments/[id] mode badge + "X of Y problems need review" framing.
- 17 backend unit/integration tests; manual smoke verified all 3
  modes against real Claude API.

No new CLAUDE.md gates lifted (Spec 11 already lifted the engine +
Claude API gates).

Carries forward Spec 11's deferred list plus new items: standalone
/answer-keys page, structured (JSONB) keys, class-level keys, key
renaming, re-diagnose with new key, auto-derive grading without flag.
Spec 13 (printable corrections PDF) is next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wrap-up

After Task 9, the branch is ahead of `origin/main` by 9 commits.

```bash
git log --oneline origin/main..HEAD
```

Expected (newest first):
```
<sha> Mark Spec 12 (answer key + engine modes) complete in CLAUDE.md
<sha> Show mode badge + N-of-M framing on assessment detail page
<sha> Wire AnswerKeyPicker + already-graded into AssessmentUploadForm
<sha> Add AnswerKeyUploadForm + AnswerKeyPicker components
<sha> Add answer-key types + actions + fetcher
<sha> Add engine modes (auto_grade / with_key / already_graded)
<sha> Wire answer_key + already_graded + review_all into assessment endpoints
<sha> Add answer-keys CRUD router (POST/GET list/GET detail/DELETE)
<sha> Add answer_key_pages table + assessment / diagnosis mode columns
```

Test status: ~94 backend tests passing, 2 skipped. Frontend lint + typecheck clean. Manual smoke verified all 3 modes.

Push when ready:

```bash
git push origin main
```

## Out of scope for this plan (deferred)

- **Standalone `/answer-keys` management page** — full list/rename UI.
- **Re-diagnose with a different key** — needs lifting UNIQUE constraint.
- **Renaming answer keys.**
- **Structured (text/JSONB) answer keys.**
- **Class-level answer keys.**
- **Auto-derive grading from teacher markings without a flag.**
- **Printable corrections PDF** (Spec 13 candidate).
- **Wrong-only-without-key for AUTO mode** (cost win evaporates).
- **Re-attaching a deleted key.**

**Carried forward from Spec 11's deferred list:**
- Auto-trigger on upload (background task / queue).
- Re-run diagnoses (versioned diagnoses).
- Partial-credit semantics.
- Mathpix integration.
- Multi-call pipeline (Sonnet + Haiku).
- Per-page visual annotations.
- Cost rate limiting / spending caps.
- Confidence scores per observation.
- Eval set infrastructure.
- Longitudinal student tracking.
- Class/cohort summaries.
- Frontend Vitest harness.
- Intervention plans (CHEC-style — gated on the math-educator hire).
