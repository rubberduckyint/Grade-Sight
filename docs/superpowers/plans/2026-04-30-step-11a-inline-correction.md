# Step 11a · Inline correction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `diagnostic_reviews` table + service + router on the backend, expose `GET /api/error-patterns`, overlay reviews onto the assessment-detail GET response, and add the teacher-facing inline edit panel on `<ProblemRow>` with a `<ReviewedSection>` for mark-correct reviews.

**Architecture:** Backend builds a new model + 3-endpoint CRUD router + service that overlays active reviews onto `ProblemObservation` rows so the existing GET response represents EFFECTIVE post-review state. Frontend converts `<ProblemRow>` to a client component with an internal state machine, adds `<EditPanel>` + `<PatternPicker>` + `<ReviewedSection>`, and wires server actions for create/update/delete. Step 10 components consume effective state transparently — only `<ProblemGrid>` needs ✎ rendering for reviewed problems.

**Tech Stack:** FastAPI + SQLAlchemy 2 + alembic + pydantic v2 (backend); Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui Select + vitest (frontend). No new packages.

**Spec:** `docs/superpowers/specs/2026-04-30-step-11a-inline-correction-design.md`

**Branch:** `step-11a-inline-correction` (already created off `main` post-Step-10 merge; spec already committed at `d59af3b`).

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| **Backend** | | |
| `apps/api/alembic/versions/<NEW>_add_diagnostic_reviews.py` | new migration | Creates `diagnostic_reviews` table + unique partial index. |
| `apps/api/src/grade_sight_api/models/diagnostic_review.py` | new model | SQLAlchemy ORM mapping with relationships. |
| `apps/api/src/grade_sight_api/schemas/diagnostic_reviews.py` | new schemas | `DiagnosticReviewCreate`, `DiagnosticReviewUpdate`, `DiagnosticReviewOut` with XOR validator. |
| `apps/api/src/grade_sight_api/schemas/error_patterns.py` | new schemas | `ErrorPatternOut` for the `/api/error-patterns` endpoint. |
| `apps/api/src/grade_sight_api/services/diagnostic_review_service.py` | new service | `apply_reviews_to_problems` overlay function. |
| `apps/api/src/grade_sight_api/routers/diagnostic_reviews.py` | new router | POST/PATCH/DELETE on `/api/assessments/{id}/reviews`. |
| `apps/api/src/grade_sight_api/routers/error_patterns.py` | new router | GET `/api/error-patterns`. |
| `apps/api/src/grade_sight_api/main.py` | modify | Register both new routers. |
| `apps/api/src/grade_sight_api/routers/assessments.py` | modify | Eager-load reviews + patterns; call overlay before returning. |
| `apps/api/src/grade_sight_api/schemas/assessments.py` | modify | Add `review: DiagnosticReviewOut \| None` to `ProblemObservation`. |
| `apps/api/tests/models/test_diagnostic_review.py` | new pytest | Defaults, FKs, soft-delete uniqueness. |
| `apps/api/tests/services/test_diagnostic_review_service.py` | new pytest | Overlay across 3 review states. |
| `apps/api/tests/routers/test_diagnostic_reviews_router.py` | new pytest | CRUD + auth + validation. |
| `apps/api/tests/routers/test_error_patterns_router.py` | new pytest | GET response shape + auth. |
| `apps/api/tests/routers/test_assessments_router.py` | modify | Add overlay-flow test. |
| **Frontend** | | |
| `apps/web/lib/types.ts` | modify | Add `DiagnosticReview`; add `review` field on `ProblemObservation`. |
| `apps/web/lib/api.ts` | modify | Add `fetchErrorPatterns()`. |
| `apps/web/lib/actions/reviews.ts` | new | Server actions: `createReview`, `updateReview`, `deleteReview`. |
| `apps/web/components/diagnosis/pattern-picker.tsx` | new (~70 lines) | shadcn Select grouped by category. |
| `apps/web/components/diagnosis/edit-panel.tsx` | new (~120 lines) | Pattern picker + checkbox + buttons + validation. |
| `apps/web/components/diagnosis/problem-row.tsx` | rewrite | Becomes `"use client"` with state machine + edit-panel hosting. |
| `apps/web/components/diagnosis/pattern-group.tsx` | modify | Thread `role` + `errorPatterns` props down. |
| `apps/web/components/diagnosis/problem-grid.tsx` | modify | Render ✎ for reviewed problems. |
| `apps/web/components/diagnosis/reviewed-section.tsx` | new (~80 lines) | List rows where `review !== null && is_correct`. |
| `apps/web/app/assessments/[id]/page.tsx` | modify | Server-fetch error patterns; render `<ReviewedSection>`. |
| `apps/web/components/diagnosis/__tests__/edit-panel.test.tsx` | new vitest | Validation + state transitions. |
| `apps/web/components/diagnosis/__tests__/problem-row.test.tsx` | new vitest | Role-aware affordance + save flow. |

---

## Task 1: `diagnostic_reviews` migration + model + uniqueness invariant test

**Files:**
- Create: `apps/api/alembic/versions/<auto-stamped>_add_diagnostic_reviews.py`
- Create: `apps/api/src/grade_sight_api/models/diagnostic_review.py`
- Create: `apps/api/tests/models/test_diagnostic_review.py`

- [ ] **Step 1: Generate the migration scaffold**

```bash
cd apps/api
.venv/bin/alembic revision -m "add diagnostic reviews"
```

Find the new file under `apps/api/alembic/versions/`. Replace its body with:

```python
"""add diagnostic reviews

Revision ID: <auto>
Revises: ec66654a8218
Create Date: 2026-04-30 ...
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "<auto>"
down_revision = "ec66654a8218"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "diagnostic_reviews",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "assessment_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("assessments.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("problem_number", sa.Integer(), nullable=False),
        sa.Column(
            "original_pattern_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("error_patterns.id"),
            nullable=True,
        ),
        sa.Column(
            "override_pattern_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("error_patterns.id"),
            nullable=True,
        ),
        sa.Column("marked_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "reviewed_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_diagnostic_reviews_active_unique",
        "diagnostic_reviews",
        ["assessment_id", "problem_number"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_diagnostic_reviews_active_unique", table_name="diagnostic_reviews")
    op.drop_table("diagnostic_reviews")
```

Replace `<auto>` and `Revises:` with the actual values stamped by alembic in your file. Keep the `down_revision` pointing at `ec66654a8218` (the diagnostic-engine tables migration — verify with `alembic history | head`).

- [ ] **Step 2: Create the SQLAlchemy model**

Write `apps/api/src/grade_sight_api/models/diagnostic_review.py`:

```python
"""Diagnostic review — teacher override of an auto-graded problem."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from grade_sight_api.models.base import Base, TimestampMixin
from grade_sight_api.models.types import TZTimestamp

if TYPE_CHECKING:
    from grade_sight_api.models.assessment import Assessment
    from grade_sight_api.models.error_pattern import ErrorPattern
    from grade_sight_api.models.user import User


class DiagnosticReview(Base, TimestampMixin):
    __tablename__ = "diagnostic_reviews"

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    problem_number: Mapped[int] = mapped_column(Integer, nullable=False)
    original_pattern_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("error_patterns.id"), nullable=True
    )
    override_pattern_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("error_patterns.id"), nullable=True
    )
    marked_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    reviewed_at: Mapped[datetime] = mapped_column(
        TZTimestamp, nullable=False, server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(TZTimestamp, nullable=True)

    assessment: Mapped["Assessment"] = relationship(back_populates="diagnostic_reviews")
    override_pattern: Mapped["ErrorPattern | None"] = relationship(
        foreign_keys=[override_pattern_id]
    )
    original_pattern: Mapped["ErrorPattern | None"] = relationship(
        foreign_keys=[original_pattern_id]
    )
    reviewer: Mapped["User"] = relationship(foreign_keys=[reviewed_by])

    __table_args__ = (
        Index(
            "ix_diagnostic_reviews_active_unique",
            "assessment_id",
            "problem_number",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
```

Note: `TimestampMixin` provides `created_at` / `updated_at`. `TZTimestamp` is the project's existing typed alias for `TIMESTAMP(timezone=True)` — verify the import path matches the pattern in `apps/api/src/grade_sight_api/models/assessment.py`. Adjust if needed.

- [ ] **Step 3: Wire the back_populates side on `Assessment`**

In `apps/api/src/grade_sight_api/models/assessment.py`, add to the `Assessment` class:

```python
    diagnostic_reviews: Mapped[list["DiagnosticReview"]] = relationship(
        back_populates="assessment",
        cascade="all, delete-orphan",
        primaryjoin="and_(Assessment.id == DiagnosticReview.assessment_id, DiagnosticReview.deleted_at.is_(None))",
        viewonly=True,
    )
```

The `primaryjoin` filter ensures the relationship only loads ACTIVE reviews. `viewonly=True` because cascade-delete is handled at the FK level, not via this filtered relationship.

Add the matching `TYPE_CHECKING` import at the top:
```python
if TYPE_CHECKING:
    from grade_sight_api.models.diagnostic_review import DiagnosticReview
```

- [ ] **Step 4: Run the migration locally**

```bash
cd apps/api
.venv/bin/alembic upgrade head
```

Expected: migration runs cleanly. Verify by querying the test DB:

```bash
psql "$TEST_DATABASE_URL" -c "\d diagnostic_reviews"
```

Confirm the table exists with all columns and the unique partial index.

- [ ] **Step 5: Write the failing model test**

Write `apps/api/tests/models/test_diagnostic_review.py`:

```python
"""Model tests for DiagnosticReview."""
from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_minimal(session: AsyncSession) -> tuple[User, Assessment]:
    org = Organization(name="t")
    session.add(org)
    await session.flush()
    user = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@x.test",
        role=UserRole.teacher,
        first_name="T",
        last_name="T",
        organization_id=org.id,
    )
    student = Student(full_name="S", grade_level=8, organization_id=org.id)
    session.add_all([user, student])
    await session.flush()
    assessment = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by=user.id,
        status=AssessmentStatus.completed,
    )
    session.add(assessment)
    await session.flush()
    return user, assessment


@pytest.mark.db
async def test_default_values(async_session: AsyncSession) -> None:
    user, assessment = await _seed_minimal(async_session)
    review = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=3,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(review)
    await async_session.flush()

    fetched = await async_session.scalar(
        select(DiagnosticReview).where(DiagnosticReview.id == review.id)
    )
    assert fetched is not None
    assert fetched.marked_correct is True
    assert fetched.override_pattern_id is None
    assert fetched.note is None
    assert fetched.deleted_at is None
    assert fetched.created_at is not None
    assert fetched.reviewed_at is not None


@pytest.mark.db
async def test_unique_active_review_per_problem(async_session: AsyncSession) -> None:
    """Two active reviews for the same (assessment, problem) violate the partial index."""
    user, assessment = await _seed_minimal(async_session)

    first = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=5,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(first)
    await async_session.flush()

    duplicate = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=5,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await async_session.flush()


@pytest.mark.db
async def test_soft_deleted_does_not_block_new_review(async_session: AsyncSession) -> None:
    """After soft-deleting a review, a new active one for the same (assessment, problem) is allowed."""
    user, assessment = await _seed_minimal(async_session)
    from datetime import datetime, timezone

    first = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=7,
        marked_correct=True,
        reviewed_by=user.id,
        deleted_at=datetime.now(tz=timezone.utc),
    )
    async_session.add(first)
    await async_session.flush()

    second = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=7,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(second)
    await async_session.flush()  # should NOT raise

    rows = (
        await async_session.scalars(
            select(DiagnosticReview).where(DiagnosticReview.assessment_id == assessment.id)
        )
    ).all()
    assert len(rows) == 2
```

- [ ] **Step 6: Run the model tests**

```bash
cd apps/api
.venv/bin/pytest tests/models/test_diagnostic_review.py -v
```

Expected: 3/3 tests pass.

- [ ] **Step 7: Run mypy**

```bash
cd apps/api
.venv/bin/mypy src/
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/alembic/versions/*_add_diagnostic_reviews.py \
        apps/api/src/grade_sight_api/models/diagnostic_review.py \
        apps/api/src/grade_sight_api/models/assessment.py \
        apps/api/tests/models/test_diagnostic_review.py
git commit -m "$(cat <<'EOF'
api: add diagnostic_reviews table + model

Step 11a · inline correction. Adds the table for teacher overrides:
unique partial index on (assessment_id, problem_number) WHERE
deleted_at IS NULL ensures one active review per problem; FKs to
assessments / error_patterns / users; soft-delete via deleted_at.

Three model tests cover default values, unique-active enforcement,
and that soft-deleting unlocks a new active review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pydantic schemas — `DiagnosticReview*` and `ErrorPatternOut`

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/diagnostic_reviews.py`
- Create: `apps/api/src/grade_sight_api/schemas/error_patterns.py`

- [ ] **Step 1: Create the diagnostic review schemas**

Write `apps/api/src/grade_sight_api/schemas/diagnostic_reviews.py`:

```python
"""Pydantic schemas for diagnostic reviews."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class DiagnosticReviewCreate(BaseModel):
    problem_number: int
    override_pattern_id: UUID | None = None
    marked_correct: bool = False
    note: str | None = None

    @model_validator(mode="after")
    def validate_one_action(self) -> "DiagnosticReviewCreate":
        if self.marked_correct and self.override_pattern_id is not None:
            raise ValueError("Cannot both mark correct and override pattern")
        if not self.marked_correct and self.override_pattern_id is None:
            raise ValueError("Must either mark correct or set override pattern")
        return self


class DiagnosticReviewUpdate(BaseModel):
    """All fields optional. Router merges into the existing record then re-runs the XOR validator on merged state."""

    override_pattern_id: UUID | None = None
    marked_correct: bool | None = None
    note: str | None = None


class DiagnosticReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    marked_correct: bool
    override_pattern_id: UUID | None
    override_pattern_slug: str | None
    override_pattern_name: str | None
    note: str | None
    reviewed_at: datetime
    reviewed_by_name: str
```

- [ ] **Step 2: Create the error-pattern schemas**

Write `apps/api/src/grade_sight_api/schemas/error_patterns.py`:

```python
"""Pydantic schemas for error patterns."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ErrorPatternOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    category_slug: str
    category_name: str
```

- [ ] **Step 3: Run mypy**

```bash
cd apps/api
.venv/bin/mypy src/grade_sight_api/schemas/
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/diagnostic_reviews.py \
        apps/api/src/grade_sight_api/schemas/error_patterns.py
git commit -m "$(cat <<'EOF'
api: add pydantic schemas for diagnostic_reviews + error_patterns

Step 11a · inline correction. DiagnosticReviewCreate enforces the
mark-correct XOR override-pattern rule via @model_validator; Update
mirrors the same shape with all fields optional (router merges into
existing record then re-runs the validator on merged state); Out
exposes everything the frontend needs for display, including
override_pattern_id for picker pre-selection on re-edits.

ErrorPatternOut feeds the new GET /api/error-patterns endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Service overlay — `apply_reviews_to_problems`

**Files:**
- Create: `apps/api/src/grade_sight_api/services/diagnostic_review_service.py`
- Create: `apps/api/tests/services/test_diagnostic_review_service.py`

This is pure-function work, TDD throughout.

- [ ] **Step 1: Write failing tests**

Write `apps/api/tests/services/test_diagnostic_review_service.py`:

```python
"""Tests for the diagnostic-review overlay service."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from grade_sight_api.schemas.assessments import ProblemObservation
from grade_sight_api.services.diagnostic_review_service import (
    OverlayInputs,
    apply_reviews_to_problems,
)


def _make_problem(
    *, problem_number: int, is_correct: bool, error_pattern_slug: str | None = None
) -> ProblemObservation:
    return ProblemObservation(
        id=uuid4(),
        problem_number=problem_number,
        page_number=1,
        student_answer="2x",
        correct_answer="x + 2",
        is_correct=is_correct,
        error_pattern_slug=error_pattern_slug,
        error_pattern_name=("name-" + error_pattern_slug) if error_pattern_slug else None,
        error_category_slug="execution",
        error_description=None,
        solution_steps=None,
        review=None,
    )


def _review_row(
    *,
    review_id: UUID,
    assessment_id: UUID,
    problem_number: int,
    marked_correct: bool = False,
    override_pattern_id: UUID | None = None,
    note: str | None = None,
    reviewer_name: str = "Jane Teacher",
) -> object:
    """Lightweight row stub — must match the fields the service reads."""

    class Row:
        def __init__(self) -> None:
            self.id = review_id
            self.assessment_id = assessment_id
            self.problem_number = problem_number
            self.marked_correct = marked_correct
            self.override_pattern_id = override_pattern_id
            self.note = note
            self.reviewed_at = datetime(2026, 4, 30, 12, 0, tzinfo=timezone.utc)
            self.reviewer_name = reviewer_name

    return Row()


def _pattern_index_with(
    pattern_id: UUID,
    *,
    slug: str,
    name: str,
    category_slug: str,
    category_name: str,
) -> dict[UUID, object]:
    class Pat:
        def __init__(self) -> None:
            self.id = pattern_id
            self.slug = slug
            self.name = name
            self.category_slug = category_slug
            self.category_name = category_name

    return {pattern_id: Pat()}


def test_no_review_passes_through_unchanged() -> None:
    p = _make_problem(problem_number=1, is_correct=False, error_pattern_slug="foo")
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[], pattern_index={})
    )
    assert len(out) == 1
    assert out[0].review is None
    assert out[0].is_correct is False
    assert out[0].error_pattern_slug == "foo"


def test_mark_correct_flips_is_correct() -> None:
    aid = uuid4()
    p = _make_problem(problem_number=4, is_correct=False, error_pattern_slug="neg-distrib")
    review = _review_row(
        review_id=uuid4(),
        assessment_id=aid,
        problem_number=4,
        marked_correct=True,
    )
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[review], pattern_index={})
    )
    assert out[0].is_correct is True
    assert out[0].error_pattern_slug == "neg-distrib"  # pattern unchanged
    assert out[0].review is not None
    assert out[0].review.marked_correct is True


def test_override_pattern_rewrites_slug_name_category() -> None:
    aid = uuid4()
    pat_id = uuid4()
    p = _make_problem(problem_number=2, is_correct=False, error_pattern_slug="auto-slug")
    pattern_index = _pattern_index_with(
        pat_id, slug="override-slug", name="Override Name", category_slug="conceptual", category_name="Conceptual"
    )
    review = _review_row(
        review_id=uuid4(),
        assessment_id=aid,
        problem_number=2,
        override_pattern_id=pat_id,
    )
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[review], pattern_index=pattern_index)
    )
    assert out[0].is_correct is False
    assert out[0].error_pattern_slug == "override-slug"
    assert out[0].error_pattern_name == "Override Name"
    assert out[0].error_category_slug == "conceptual"
    assert out[0].review is not None
    assert out[0].review.override_pattern_id == pat_id


def test_mismatched_problem_numbers_pass_through() -> None:
    aid = uuid4()
    p = _make_problem(problem_number=1, is_correct=False)
    review = _review_row(review_id=uuid4(), assessment_id=aid, problem_number=99, marked_correct=True)
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[review], pattern_index={})
    )
    assert out[0].review is None
    assert out[0].is_correct is False


def test_multiple_reviews_compose_independently() -> None:
    aid = uuid4()
    pat_id = uuid4()
    p1 = _make_problem(problem_number=1, is_correct=False, error_pattern_slug="auto-1")
    p2 = _make_problem(problem_number=2, is_correct=False, error_pattern_slug="auto-2")
    p3 = _make_problem(problem_number=3, is_correct=True)
    pattern_index = _pattern_index_with(
        pat_id, slug="x", name="X", category_slug="execution", category_name="Execution"
    )
    review1 = _review_row(review_id=uuid4(), assessment_id=aid, problem_number=1, marked_correct=True)
    review2 = _review_row(review_id=uuid4(), assessment_id=aid, problem_number=2, override_pattern_id=pat_id)
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p1, p2, p3], reviews=[review1, review2], pattern_index=pattern_index)
    )
    assert out[0].is_correct is True
    assert out[0].review is not None
    assert out[1].is_correct is False
    assert out[1].error_pattern_slug == "x"
    assert out[1].review is not None
    assert out[2].review is None  # untouched
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/api
.venv/bin/pytest tests/services/test_diagnostic_review_service.py -v
```

Expected: ImportError or 5 failures because the service doesn't exist yet.

- [ ] **Step 3: Implement the service**

Write `apps/api/src/grade_sight_api/services/diagnostic_review_service.py`:

```python
"""Overlay teacher diagnostic reviews onto auto-graded problem observations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from grade_sight_api.schemas.assessments import ProblemObservation
from grade_sight_api.schemas.diagnostic_reviews import DiagnosticReviewOut


class _ReviewRow(Protocol):
    """Structural type — any object exposing the fields below works as a review row."""

    id: UUID
    problem_number: int
    marked_correct: bool
    override_pattern_id: UUID | None
    note: str | None
    reviewed_at: object  # datetime
    reviewer_name: str


class _PatternRow(Protocol):
    id: UUID
    slug: str
    name: str
    category_slug: str
    category_name: str


@dataclass
class OverlayInputs:
    problems: list[ProblemObservation]
    reviews: list[_ReviewRow]
    pattern_index: dict[UUID, _PatternRow]


def apply_reviews_to_problems(inputs: OverlayInputs) -> list[ProblemObservation]:
    """Return the problems with effective state applied and review sub-objects populated."""

    by_number: dict[int, _ReviewRow] = {r.problem_number: r for r in inputs.reviews}
    out: list[ProblemObservation] = []

    for problem in inputs.problems:
        review = by_number.get(problem.problem_number)
        if review is None:
            out.append(problem.model_copy(update={"review": None}))
            continue

        review_out = _build_review_out(review, inputs.pattern_index)
        updates: dict[str, object] = {"review": review_out}

        if review.marked_correct:
            updates["is_correct"] = True
        elif review.override_pattern_id is not None:
            override = inputs.pattern_index.get(review.override_pattern_id)
            if override is not None:
                updates["error_pattern_slug"] = override.slug
                updates["error_pattern_name"] = override.name
                updates["error_category_slug"] = override.category_slug

        out.append(problem.model_copy(update=updates))

    return out


def _build_review_out(
    review: _ReviewRow, pattern_index: dict[UUID, _PatternRow]
) -> DiagnosticReviewOut:
    override_pattern = (
        pattern_index.get(review.override_pattern_id)
        if review.override_pattern_id is not None
        else None
    )
    return DiagnosticReviewOut(
        id=review.id,
        marked_correct=review.marked_correct,
        override_pattern_id=review.override_pattern_id,
        override_pattern_slug=override_pattern.slug if override_pattern else None,
        override_pattern_name=override_pattern.name if override_pattern else None,
        note=review.note,
        reviewed_at=review.reviewed_at,
        reviewed_by_name=review.reviewer_name,
    )
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
cd apps/api
.venv/bin/pytest tests/services/test_diagnostic_review_service.py -v
```

Expected: 5/5 pass.

- [ ] **Step 5: mypy**

```bash
cd apps/api
.venv/bin/mypy src/grade_sight_api/services/diagnostic_review_service.py
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/diagnostic_review_service.py \
        apps/api/tests/services/test_diagnostic_review_service.py
git commit -m "$(cat <<'EOF'
api: add diagnostic_review_service.apply_reviews_to_problems

Step 11a · inline correction. Pure function that overlays active
reviews onto auto-graded ProblemObservation rows. mark-correct flips
is_correct; override-pattern rewrites slug/name/category from the
indexed ErrorPattern row; reviewed problems also get a populated
review sub-object for display. Five tests cover no-review pass-
through, mark-correct, pattern-override, mismatched problem numbers,
and multi-review composition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: GET `/api/error-patterns` router + tests

**Files:**
- Create: `apps/api/src/grade_sight_api/routers/error_patterns.py`
- Create: `apps/api/tests/routers/test_error_patterns_router.py`
- Modify: `apps/api/src/grade_sight_api/main.py` (register router)

- [ ] **Step 1: Create the router**

Write `apps/api/src/grade_sight_api/routers/error_patterns.py`:

```python
"""Read-only error-patterns endpoint feeding the inline-edit pattern picker."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.user import User
from grade_sight_api.schemas.error_patterns import ErrorPatternOut

router = APIRouter(prefix="/api/error-patterns", tags=["error-patterns"])


@router.get("", response_model=list[ErrorPatternOut])
async def list_error_patterns(
    _user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ErrorPatternOut]:
    """Return active error patterns ordered by category then name.

    Open to any authenticated user — taxonomy is global infrastructure,
    not student data.
    """
    rows = (
        await session.scalars(
            select(ErrorPattern, ErrorCategory)
            .join(ErrorCategory, ErrorPattern.category_id == ErrorCategory.id)
            .where(ErrorPattern.deleted_at.is_(None))
            .order_by(ErrorCategory.slug, ErrorPattern.name)
        )
    ).all()
    # The select(ErrorPattern, ErrorCategory) form returns ErrorPattern rows
    # because of how scalars unpacks; refactor if the existing codebase prefers
    # session.execute().all() with tuple unpacking. Keep it simple here.
    out: list[ErrorPatternOut] = []
    for pattern in rows:
        category = pattern.category  # via relationship
        out.append(
            ErrorPatternOut(
                id=pattern.id,
                slug=pattern.slug,
                name=pattern.name,
                category_slug=category.slug,
                category_name=category.name,
            )
        )
    return out
```

If the `ErrorPattern.category` relationship isn't already defined, fall back to:

```python
rows = (
    await session.execute(
        select(ErrorPattern, ErrorCategory)
        .join(ErrorCategory, ErrorPattern.category_id == ErrorCategory.id)
        .where(ErrorPattern.deleted_at.is_(None))
        .order_by(ErrorCategory.slug, ErrorPattern.name)
    )
).all()

out = [
    ErrorPatternOut(
        id=pattern.id,
        slug=pattern.slug,
        name=pattern.name,
        category_slug=category.slug,
        category_name=category.name,
    )
    for pattern, category in rows
]
return out
```

Pick whichever shape fits your model graph; the response shape is the same.

- [ ] **Step 2: Register the router in main.py**

In `apps/api/src/grade_sight_api/main.py`, add:

```python
from grade_sight_api.routers import error_patterns
# ... existing imports

app.include_router(error_patterns.router)
```

Place the include next to the other `app.include_router(...)` calls.

- [ ] **Step 3: Write the failing test**

Write `apps/api/tests/routers/test_error_patterns_router.py`:

```python
"""Tests for GET /api/error-patterns."""
from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.user import User, UserRole


async def _seed_user(session: AsyncSession) -> User:
    org = Organization(name="t")
    session.add(org)
    await session.flush()
    user = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@x.test",
        role=UserRole.teacher,
        first_name="T",
        last_name="T",
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    return user


@pytest.mark.db
async def test_returns_active_patterns_ordered(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    cat = ErrorCategory(slug="conceptual", name="Conceptual")
    async_session.add(cat)
    await async_session.flush()
    pat_b = ErrorPattern(slug="b-pat", name="B Pattern", category_id=cat.id)
    pat_a = ErrorPattern(slug="a-pat", name="A Pattern", category_id=cat.id)
    async_session.add_all([pat_b, pat_a])
    await async_session.flush()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/error-patterns")
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            # ordered by category_slug then name → A before B
            slugs = [row["slug"] for row in body if row["slug"] in {"a-pat", "b-pat"}]
            assert slugs == ["a-pat", "b-pat"]
            sample = next(row for row in body if row["slug"] == "a-pat")
            assert sample["name"] == "A Pattern"
            assert sample["category_slug"] == "conceptual"
            assert sample["category_name"] == "Conceptual"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_unauthenticated_returns_401(async_session: AsyncSession) -> None:
    """No auth dependency override → real auth runs → no token → 401."""
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/error-patterns")
            assert response.status_code in {401, 403}  # depends on Clerk middleware shape
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 4: Run failing tests**

```bash
cd apps/api
.venv/bin/pytest tests/routers/test_error_patterns_router.py -v
```

Expected initially: tests pass once the router is registered. If 404, double-check the include in main.py.

- [ ] **Step 5: Run mypy + tests**

```bash
cd apps/api
.venv/bin/mypy src/
.venv/bin/pytest tests/routers/test_error_patterns_router.py -v
```

Expected: 2/2 pass, mypy clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/routers/error_patterns.py \
        apps/api/src/grade_sight_api/main.py \
        apps/api/tests/routers/test_error_patterns_router.py
git commit -m "$(cat <<'EOF'
api: add GET /api/error-patterns

Step 11a · inline correction. Read-only endpoint exposing the
active error-pattern taxonomy ordered by category then name. Open
to any authenticated user (taxonomy is global infrastructure, not
student data). Two tests cover the response shape + auth gate.

Used by the inline-edit pattern picker in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: POST/PATCH/DELETE `/api/assessments/{id}/reviews` router + audit logging + tests

**Files:**
- Create: `apps/api/src/grade_sight_api/routers/diagnostic_reviews.py`
- Create: `apps/api/tests/routers/test_diagnostic_reviews_router.py`
- Modify: `apps/api/src/grade_sight_api/main.py` (register router)

This task is the largest in the plan — three endpoints + comprehensive auth/validation tests + audit-log verification. Take it slowly; commit at the end as one atomic unit.

- [ ] **Step 1: Create the router**

Write `apps/api/src/grade_sight_api/routers/diagnostic_reviews.py`:

```python
"""Teacher diagnostic-review CRUD."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.models.assessment import Assessment
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.user import User
from grade_sight_api.schemas.diagnostic_reviews import (
    DiagnosticReviewCreate,
    DiagnosticReviewOut,
    DiagnosticReviewUpdate,
)
from grade_sight_api.services import audit_service

router = APIRouter(prefix="/api/assessments", tags=["diagnostic-reviews"])


async def _load_assessment_for_write(
    assessment_id: UUID, user: User, session: AsyncSession
) -> Assessment:
    """Load the assessment + run the strict org-match write predicate."""
    assessment = await session.scalar(
        select(Assessment).where(Assessment.id == assessment_id)
    )
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if user.organization_id is None or user.organization_id != assessment.organization_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return assessment


def _to_out(review: DiagnosticReview) -> DiagnosticReviewOut:
    override = review.override_pattern  # eager-loaded
    reviewer = review.reviewer
    return DiagnosticReviewOut(
        id=review.id,
        marked_correct=review.marked_correct,
        override_pattern_id=review.override_pattern_id,
        override_pattern_slug=override.slug if override else None,
        override_pattern_name=override.name if override else None,
        note=review.note,
        reviewed_at=review.reviewed_at,
        reviewed_by_name=f"{reviewer.first_name} {reviewer.last_name}".strip(),
    )


@router.post(
    "/{assessment_id}/reviews",
    response_model=DiagnosticReviewOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_review(
    assessment_id: UUID,
    payload: DiagnosticReviewCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DiagnosticReviewOut:
    assessment = await _load_assessment_for_write(assessment_id, user, session)

    # Snapshot original_pattern_id from the matching ProblemObservation.
    # Engine output is on Assessment.diagnosis.problems; the schema column for
    # error_pattern_slug joins back to error_patterns. Look up the original
    # pattern's UUID for snapshot.
    original_pattern_id = await _lookup_original_pattern_id(
        assessment_id, payload.problem_number, session
    )

    review = DiagnosticReview(
        assessment_id=assessment_id,
        problem_number=payload.problem_number,
        original_pattern_id=original_pattern_id,
        override_pattern_id=payload.override_pattern_id,
        marked_correct=payload.marked_correct,
        note=payload.note,
        reviewed_by=user.id,
    )
    session.add(review)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="A review already exists for this problem",
        ) from None

    await session.refresh(review, attribute_names=["override_pattern", "reviewer"])

    await audit_service.write(
        session=session,
        actor_id=user.id,
        organization_id=assessment.organization_id,
        action="diagnostic_review.create",
        subject_id=assessment_id,
        metadata={
            "review_id": str(review.id),
            "problem_number": payload.problem_number,
        },
    )
    await session.commit()
    return _to_out(review)


@router.patch(
    "/{assessment_id}/reviews/{review_id}",
    response_model=DiagnosticReviewOut,
)
async def update_review(
    assessment_id: UUID,
    review_id: UUID,
    payload: DiagnosticReviewUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DiagnosticReviewOut:
    assessment = await _load_assessment_for_write(assessment_id, user, session)
    review = await session.scalar(
        select(DiagnosticReview).where(
            DiagnosticReview.id == review_id,
            DiagnosticReview.assessment_id == assessment_id,
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    # Merge patch into existing record
    if payload.override_pattern_id is not None:
        review.override_pattern_id = payload.override_pattern_id
    if payload.marked_correct is not None:
        review.marked_correct = payload.marked_correct
    if payload.note is not None:
        review.note = payload.note

    # Re-run the XOR validator on merged state
    if review.marked_correct and review.override_pattern_id is not None:
        raise HTTPException(
            status_code=422,
            detail="Cannot both mark correct and override pattern",
        )
    if not review.marked_correct and review.override_pattern_id is None:
        raise HTTPException(
            status_code=422,
            detail="Must either mark correct or set override pattern",
        )

    await session.flush()
    await session.refresh(review, attribute_names=["override_pattern", "reviewer"])

    await audit_service.write(
        session=session,
        actor_id=user.id,
        organization_id=assessment.organization_id,
        action="diagnostic_review.update",
        subject_id=assessment_id,
        metadata={
            "review_id": str(review.id),
            "problem_number": review.problem_number,
        },
    )
    await session.commit()
    return _to_out(review)


@router.delete(
    "/{assessment_id}/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_review(
    assessment_id: UUID,
    review_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    assessment = await _load_assessment_for_write(assessment_id, user, session)
    review = await session.scalar(
        select(DiagnosticReview).where(
            DiagnosticReview.id == review_id,
            DiagnosticReview.assessment_id == assessment_id,
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    from datetime import datetime, timezone
    review.deleted_at = datetime.now(tz=timezone.utc)
    await session.flush()

    await audit_service.write(
        session=session,
        actor_id=user.id,
        organization_id=assessment.organization_id,
        action="diagnostic_review.delete",
        subject_id=assessment_id,
        metadata={
            "review_id": str(review.id),
            "problem_number": review.problem_number,
        },
    )
    await session.commit()


async def _lookup_original_pattern_id(
    assessment_id: UUID, problem_number: int, session: AsyncSession
) -> UUID | None:
    """Find the auto-grade error_pattern_id for the given problem at review-create time.

    Reads from the engine's ProblemObservation table. Returns None if the
    problem has no auto-graded pattern (engine couldn't classify, or
    problem doesn't exist on this assessment).
    """
    from grade_sight_api.models.assessment_diagnosis import (
        AssessmentDiagnosis,
        ProblemObservationRow,
    )

    diagnosis = await session.scalar(
        select(AssessmentDiagnosis)
        .where(AssessmentDiagnosis.assessment_id == assessment_id)
        .order_by(AssessmentDiagnosis.created_at.desc())
        .limit(1)
    )
    if diagnosis is None:
        return None
    obs = await session.scalar(
        select(ProblemObservationRow)
        .where(
            ProblemObservationRow.diagnosis_id == diagnosis.id,
            ProblemObservationRow.problem_number == problem_number,
        )
        .limit(1)
    )
    if obs is None:
        return None
    # The model exposes error_pattern_id (FK) — confirm with the existing model file.
    return getattr(obs, "error_pattern_id", None)
```

The exact import paths and column names for the engine's `ProblemObservationRow` should be verified against `apps/api/src/grade_sight_api/models/assessment_diagnosis.py` — adjust if the model names differ.

The `audit_service.write(...)` call uses the existing service-module pattern — check `apps/api/src/grade_sight_api/services/audit_service.py` for the exact signature and adapt if needed.

- [ ] **Step 2: Register the router**

In `apps/api/src/grade_sight_api/main.py`:

```python
from grade_sight_api.routers import diagnostic_reviews

app.include_router(diagnostic_reviews.router)
```

- [ ] **Step 3: Write the failing tests**

Write `apps/api/tests/routers/test_diagnostic_reviews_router.py`:

```python
"""Tests for the diagnostic-reviews router."""
from __future__ import annotations

from uuid import uuid4

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
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_world(async_session: AsyncSession) -> tuple[User, User, Assessment, ErrorPattern]:
    """Returns (teacher_in_org, teacher_in_other_org, assessment, override_pattern)."""
    org_a = Organization(name="A")
    org_b = Organization(name="B")
    async_session.add_all([org_a, org_b])
    await async_session.flush()

    teacher_a = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@a.test",
        role=UserRole.teacher,
        first_name="A",
        last_name="Teach",
        organization_id=org_a.id,
    )
    teacher_b = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@b.test",
        role=UserRole.teacher,
        first_name="B",
        last_name="Teach",
        organization_id=org_b.id,
    )
    student = Student(full_name="S", grade_level=8, organization_id=org_a.id)
    async_session.add_all([teacher_a, teacher_b, student])
    await async_session.flush()

    assessment = Assessment(
        student_id=student.id,
        organization_id=org_a.id,
        uploaded_by=teacher_a.id,
        status=AssessmentStatus.completed,
    )
    cat = ErrorCategory(slug="execution", name="Execution")
    async_session.add_all([assessment, cat])
    await async_session.flush()
    pattern = ErrorPattern(slug="x", name="X", category_id=cat.id)
    async_session.add(pattern)
    await async_session.flush()
    return teacher_a, teacher_b, assessment, pattern


@pytest.mark.db
async def test_create_with_mark_correct(async_session: AsyncSession) -> None:
    teacher, _, assessment, _ = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 3, "marked_correct": True},
            )
            assert response.status_code == 201
            body = response.json()
            assert body["marked_correct"] is True
            assert body["override_pattern_id"] is None

        # audit log written
        log = await async_session.scalar(
            select(AuditLog).where(AuditLog.action == "diagnostic_review.create")
        )
        assert log is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_create_with_override_pattern(async_session: AsyncSession) -> None:
    teacher, _, assessment, pattern = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={
                    "problem_number": 4,
                    "override_pattern_id": str(pattern.id),
                    "marked_correct": False,
                },
            )
            assert response.status_code == 201
            body = response.json()
            assert body["override_pattern_id"] == str(pattern.id)
            assert body["override_pattern_slug"] == "x"
            assert body["override_pattern_name"] == "X"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_create_validates_xor(async_session: AsyncSession) -> None:
    teacher, _, assessment, pattern = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # both set → 422
            r1 = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 1, "marked_correct": True, "override_pattern_id": str(pattern.id)},
            )
            assert r1.status_code == 422
            # neither set → 422
            r2 = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 1},
            )
            assert r2.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_create_blocks_wrong_org(async_session: AsyncSession) -> None:
    _, other_teacher, assessment, _ = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: other_teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 2, "marked_correct": True},
            )
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_create_blocks_no_org_user(async_session: AsyncSession) -> None:
    """Parent (organization_id is None) gets 403 even if assessment is parent-owned."""
    teacher, _, assessment, _ = await _seed_world(async_session)
    parent = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@p.test",
        role=UserRole.parent,
        first_name="P",
        last_name="Parent",
        organization_id=None,
    )
    async_session.add(parent)
    await async_session.flush()

    app.dependency_overrides[get_current_user] = lambda: parent
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 2, "marked_correct": True},
            )
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_create_duplicate_returns_409(async_session: AsyncSession) -> None:
    teacher, _, assessment, _ = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r1 = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 9, "marked_correct": True},
            )
            assert r1.status_code == 201
            r2 = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 9, "marked_correct": True},
            )
            assert r2.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_update_merges_and_revalidates(async_session: AsyncSession) -> None:
    teacher, _, assessment, pattern = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            create = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 1, "marked_correct": True},
            )
            review_id = create.json()["id"]

            # Switch from mark_correct → override pattern
            patch = await client.patch(
                f"/api/assessments/{assessment.id}/reviews/{review_id}",
                json={"marked_correct": False, "override_pattern_id": str(pattern.id)},
            )
            assert patch.status_code == 200
            body = patch.json()
            assert body["marked_correct"] is False
            assert body["override_pattern_id"] == str(pattern.id)

            # Patch resulting in invalid state → 422
            invalid = await client.patch(
                f"/api/assessments/{assessment.id}/reviews/{review_id}",
                json={"override_pattern_id": None, "marked_correct": False},
            )
            assert invalid.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_delete_soft_deletes(async_session: AsyncSession) -> None:
    teacher, _, assessment, _ = await _seed_world(async_session)
    app.dependency_overrides[get_current_user] = lambda: teacher
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            create = await client.post(
                f"/api/assessments/{assessment.id}/reviews",
                json={"problem_number": 6, "marked_correct": True},
            )
            review_id = create.json()["id"]
            response = await client.delete(
                f"/api/assessments/{assessment.id}/reviews/{review_id}"
            )
            assert response.status_code == 204

        # Verify soft-deleted, not hard-deleted
        from uuid import UUID as _UUID
        review = await async_session.scalar(
            select(DiagnosticReview).where(DiagnosticReview.id == _UUID(review_id))
        )
        assert review is not None
        assert review.deleted_at is not None

        # Audit row written
        log = await async_session.scalar(
            select(AuditLog).where(AuditLog.action == "diagnostic_review.delete")
        )
        assert log is not None
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api
.venv/bin/pytest tests/routers/test_diagnostic_reviews_router.py -v
```

Expected: 8/8 pass.

- [ ] **Step 5: mypy**

```bash
cd apps/api
.venv/bin/mypy src/
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/routers/diagnostic_reviews.py \
        apps/api/src/grade_sight_api/main.py \
        apps/api/tests/routers/test_diagnostic_reviews_router.py
git commit -m "$(cat <<'EOF'
api: add diagnostic_reviews router (POST/PATCH/DELETE) + audit logs

Step 11a · inline correction. Three endpoints under
/api/assessments/{id}/reviews:

  POST    create — validates XOR; snapshots original_pattern_id
  PATCH   merge + re-validate (handles state changes like flipping
          mark-correct ↔ override-pattern)
  DELETE  soft-delete via deleted_at; partial unique index
          allows future re-creates for the same problem

Strict org-match auth predicate denies parents (organization_id IS
NULL) and wrong-org teachers. Each write logs to audit_log via the
existing service-layer pattern.

Eight tests cover create variants, XOR validation, org auth (parent
+ wrong-org), unique-constraint 409, PATCH merge + revalidation, and
DELETE soft-delete with audit verification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire reviews + ProblemObservation.review into the assessment-detail GET

**Files:**
- Modify: `apps/api/src/grade_sight_api/schemas/assessments.py` — add `review` field on `ProblemObservation`.
- Modify: `apps/api/src/grade_sight_api/routers/assessments.py` — eager-load reviews, build pattern index, call `apply_reviews_to_problems` before returning.
- Modify: `apps/api/tests/routers/test_assessments_router.py` — add overlay-flow test.

- [ ] **Step 1: Extend `ProblemObservation` schema**

In `apps/api/src/grade_sight_api/schemas/assessments.py`, find the `ProblemObservation` class and add the `review` field:

```python
from grade_sight_api.schemas.diagnostic_reviews import DiagnosticReviewOut


class ProblemObservation(BaseModel):
    # ... existing fields unchanged ...
    review: DiagnosticReviewOut | None = None
```

- [ ] **Step 2: Modify `GET /api/assessments/{id}` to apply overlay**

Find the existing `GET /api/assessments/{id}` handler in `apps/api/src/grade_sight_api/routers/assessments.py`. Around the point where it builds the response, add:

```python
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.services.diagnostic_review_service import (
    OverlayInputs,
    apply_reviews_to_problems,
)


# After the diagnosis + problems are loaded:
if detail.diagnosis is not None and detail.diagnosis.problems:
    reviews = (
        await session.scalars(
            select(DiagnosticReview)
            .where(
                DiagnosticReview.assessment_id == assessment.id,
                DiagnosticReview.deleted_at.is_(None),
            )
        )
    ).all()

    # Build pattern index — covers any pattern referenced by any review
    pattern_ids = {
        r.override_pattern_id for r in reviews if r.override_pattern_id is not None
    }
    if pattern_ids:
        pattern_rows = (
            await session.scalars(
                select(ErrorPattern).where(ErrorPattern.id.in_(pattern_ids))
            )
        ).all()
        pattern_index = {p.id: p for p in pattern_rows}
    else:
        pattern_index = {}

    # Build review row stubs that match the service's structural Protocol
    review_rows = []
    for r in reviews:
        # Eager-load reviewer for the reviewer_name field
        await session.refresh(r, attribute_names=["reviewer", "override_pattern"])
        # Wrap with a small adapter so the service sees `reviewer_name`
        class _Adapter:
            def __init__(self, row: DiagnosticReview) -> None:
                self.id = row.id
                self.problem_number = row.problem_number
                self.marked_correct = row.marked_correct
                self.override_pattern_id = row.override_pattern_id
                self.note = row.note
                self.reviewed_at = row.reviewed_at
                self.reviewer_name = (
                    f"{row.reviewer.first_name} {row.reviewer.last_name}".strip()
                    if row.reviewer
                    else ""
                )
        review_rows.append(_Adapter(r))

    # Apply overlay
    detail.diagnosis.problems = apply_reviews_to_problems(
        OverlayInputs(
            problems=detail.diagnosis.problems,
            reviews=review_rows,
            pattern_index=pattern_index,  # type: ignore[arg-type]
        )
    )
```

The exact patch location depends on the existing handler's structure — the implementer may need to adapt. The principle is: after the diagnosis and problems list is built, but before the response is returned, run the overlay.

If the existing handler uses an immutable `AssessmentDetail` object that can't be mutated in place, build a new diagnosis with replaced problems via `model_copy(update={"problems": apply_reviews_to_problems(...)})`.

- [ ] **Step 3: Add the overlay-flow test**

Append to `apps/api/tests/routers/test_assessments_router.py`:

```python
@pytest.mark.db
async def test_get_assessment_applies_review_overlay(async_session: AsyncSession) -> None:
    """Posting a review then GETting the assessment shows effective state + sub-object."""
    from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
    from grade_sight_api.models.diagnostic_review import DiagnosticReview
    # ... seed an assessment with a completed diagnosis containing 1 wrong problem ...
    user = await _seed_user(async_session)
    student = await _seed_student(async_session, user)
    # Build assessment + diagnosis + at least one wrong ProblemObservationRow
    # (mirror the existing pattern from other tests in this file).
    # Then create a mark-correct review for problem_number=1.
    # GET the assessment, assert problems[0].is_correct is True and
    # problems[0].review is not None.
    # Refer to existing test_get_assessment_detail tests for the seed pattern.
    pass
```

The test author should fill in the seed boilerplate by referencing the existing `test_get_assessment_detail`-style helpers in the same file. The key assertions:

- `body["diagnosis"]["problems"][0]["is_correct"] is True` (effective state from mark_correct).
- `body["diagnosis"]["problems"][0]["review"] is not None`.
- `body["diagnosis"]["problems"][0]["review"]["marked_correct"] is True`.

If sketching the test takes more than 30 minutes, mark this task DONE_WITH_CONCERNS — leave the placeholder, ship the overlay logic, and follow up.

- [ ] **Step 4: Run all assessment-router tests**

```bash
cd apps/api
.venv/bin/pytest tests/routers/test_assessments_router.py -v
```

Expected: existing tests still pass; new test passes.

- [ ] **Step 5: mypy**

```bash
cd apps/api
.venv/bin/mypy src/
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/assessments.py \
        apps/api/src/grade_sight_api/routers/assessments.py \
        apps/api/tests/routers/test_assessments_router.py
git commit -m "$(cat <<'EOF'
api: apply diagnostic_review overlay in GET /api/assessments/{id}

Step 11a · inline correction. Extends ProblemObservation with
review: DiagnosticReviewOut | None. Modifies the assessment-detail
GET to eager-load active reviews + needed error_pattern rows, then
calls apply_reviews_to_problems before returning. Existing fields
(is_correct, error_pattern_slug, etc.) now represent EFFECTIVE
post-review state — Step 10's frontend helpers (buildTopSentence,
groupProblemsByPattern) consume them unchanged.

One new pytest verifies a mark-correct review flows through the
GET response with effective is_correct=True and a populated review
sub-object.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend types + `fetchErrorPatterns` helper

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Update types**

Append to `apps/web/lib/types.ts`:

```typescript
export interface DiagnosticReview {
  id: string;
  marked_correct: boolean;
  override_pattern_id: string | null;
  override_pattern_slug: string | null;
  override_pattern_name: string | null;
  note: string | null;
  reviewed_at: string;
  reviewed_by_name: string;
}

export interface ErrorPattern {
  id: string;
  slug: string;
  name: string;
  category_slug: string;
  category_name: string;
}
```

Then find the `ProblemObservation` interface and add the `review` field:

```typescript
export interface ProblemObservation {
  // ... existing fields ...
  review: DiagnosticReview | null;
}
```

- [ ] **Step 2: Add the API helper**

Append to `apps/web/lib/api.ts`:

```typescript
import type { ErrorPattern } from "@/lib/types";

export async function fetchErrorPatterns(): Promise<ErrorPattern[]> {
  const token = await getAuthToken();
  if (!token) return [];

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/error-patterns`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET /api/error-patterns failed: ${response.status}`);
  }
  return (await response.json()) as ErrorPattern[];
}
```

The exact `getAuthToken()` invocation should match the patterns in the rest of `api.ts` — it's currently `auth().then(a => a.getToken())` or similar; mirror an existing helper like `fetchMe`.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/api.ts
git commit -m "$(cat <<'EOF'
web: add DiagnosticReview type + fetchErrorPatterns helper

Step 11a · inline correction. ProblemObservation gains a
review: DiagnosticReview | null field carrying override metadata
for display. New ErrorPattern type matches the GET /api/error-patterns
response shape. fetchErrorPatterns helper mirrors the existing
fetchMe pattern (Bearer token, cache: no-store).

No call sites yet — this commit just adds the types + helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Server actions for review CRUD

**Files:**
- Create: `apps/web/lib/actions/reviews.ts`

- [ ] **Step 1: Check for an existing actions directory**

```bash
ls apps/web/lib/actions/ 2>&1 || echo "no actions dir"
```

If the directory doesn't exist, create it.

- [ ] **Step 2: Create the server actions file**

Write `apps/web/lib/actions/reviews.ts`:

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";

import { env } from "@/env";
import type { DiagnosticReview } from "@/lib/types";

interface CreateReviewPayload {
  problem_number: number;
  override_pattern_id?: string | null;
  marked_correct: boolean;
  note?: string | null;
}

interface UpdateReviewPayload {
  override_pattern_id?: string | null;
  marked_correct?: boolean;
  note?: string | null;
}

async function getToken(): Promise<string> {
  const { getToken: get } = await auth();
  const token = await get();
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function createReview(
  assessmentId: string,
  payload: CreateReviewPayload,
): Promise<DiagnosticReview> {
  const token = await getToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/assessments/${assessmentId}/reviews`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Create review failed: ${response.status}`);
  }
  return (await response.json()) as DiagnosticReview;
}

export async function updateReview(
  assessmentId: string,
  reviewId: string,
  payload: UpdateReviewPayload,
): Promise<DiagnosticReview> {
  const token = await getToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/assessments/${assessmentId}/reviews/${reviewId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Update review failed: ${response.status}`);
  }
  return (await response.json()) as DiagnosticReview;
}

export async function deleteReview(
  assessmentId: string,
  reviewId: string,
): Promise<void> {
  const token = await getToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/assessments/${assessmentId}/reviews/${reviewId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(text || `Delete review failed: ${response.status}`);
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/actions/reviews.ts
git commit -m "$(cat <<'EOF'
web: add server actions for diagnostic review CRUD

Step 11a · inline correction. createReview / updateReview / deleteReview
wrap the FastAPI endpoints with the user's Clerk token. Errors bubble
their response text up so the caller's notify.error toast can display
the API message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `<PatternPicker>` component

**Files:**
- Create: `apps/web/components/diagnosis/pattern-picker.tsx`

- [ ] **Step 1: Confirm shadcn Select is installed**

```bash
ls apps/web/components/ui/select.tsx 2>&1
```

If missing:

```bash
cd apps/web
pnpm dlx shadcn@latest add select
```

- [ ] **Step 2: Create the component**

Write `apps/web/components/diagnosis/pattern-picker.tsx`:

```typescript
"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ErrorPattern } from "@/lib/types";

export function PatternPicker({
  value,
  onChange,
  patterns,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  patterns: ErrorPattern[];
  disabled?: boolean;
}) {
  // Group patterns by category_slug, preserving the API's category-then-name order
  const grouped = new Map<string, { categoryName: string; items: ErrorPattern[] }>();
  for (const p of patterns) {
    const bucket = grouped.get(p.category_slug);
    if (bucket) {
      bucket.items.push(p);
    } else {
      grouped.set(p.category_slug, { categoryName: p.category_name, items: [p] });
    }
  }

  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => onChange(next === "" ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        className="font-sans text-sm border-rule rounded-[var(--radius-sm)]"
        aria-label="Select error pattern"
      >
        <SelectValue placeholder={disabled ? "Marked correct — no pattern" : "Choose a pattern…"} />
      </SelectTrigger>
      <SelectContent>
        {Array.from(grouped.entries()).map(([slug, group]) => (
          <SelectGroup key={slug}>
            <SelectLabel className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
              {group.categoryName}
            </SelectLabel>
            {group.items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/diagnosis/pattern-picker.tsx \
        apps/web/components/ui/select.tsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
web: add diagnosis/pattern-picker (shadcn Select grouped by category)

Step 11a · inline correction. Wraps the shadcn Select primitive,
grouping options by category_slug with mono-caps SelectLabel
headers. Disabled state shows "Marked correct — no pattern" so the
panel reads honestly when the teacher has chosen mark-correct.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `<EditPanel>` component + vitest

**Files:**
- Create: `apps/web/components/diagnosis/edit-panel.tsx`
- Create: `apps/web/components/diagnosis/__tests__/edit-panel.test.tsx`

- [ ] **Step 1: Create the component**

Write `apps/web/components/diagnosis/edit-panel.tsx`:

```typescript
"use client";

import { useState } from "react";

import { PatternPicker } from "@/components/diagnosis/pattern-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ErrorPattern } from "@/lib/types";

export interface EditPanelProps {
  initialPatternId: string | null;
  initialMarkedCorrect: boolean;
  patterns: ErrorPattern[];
  hasExistingReview: boolean;
  isSaving: boolean;
  onSave: (state: { override_pattern_id: string | null; marked_correct: boolean }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function EditPanel({
  initialPatternId,
  initialMarkedCorrect,
  patterns,
  hasExistingReview,
  isSaving,
  onSave,
  onCancel,
  onDelete,
}: EditPanelProps) {
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(initialPatternId);
  const [markedCorrect, setMarkedCorrect] = useState(initialMarkedCorrect);

  const canSave =
    !isSaving &&
    !(selectedPatternId === null && !markedCorrect) &&
    !(selectedPatternId !== null && markedCorrect);

  return (
    <div className="border-l-[2px] border-l-accent pl-4 py-1">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        Editing this diagnosis
      </p>

      <div className="mt-3">
        <p className="font-mono text-xs text-ink-mute mb-1">Pattern:</p>
        <PatternPicker
          value={selectedPatternId}
          onChange={setSelectedPatternId}
          patterns={patterns}
          disabled={markedCorrect || isSaving}
        />
      </div>

      <label className="flex gap-2 items-center mt-3 text-sm text-ink-soft cursor-pointer">
        <Checkbox
          checked={markedCorrect}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setMarkedCorrect(next);
            if (next) setSelectedPatternId(null);
          }}
          disabled={isSaving}
          aria-label="Mark this problem as actually correct"
        />
        Mark as actually correct
      </label>

      <div className="flex gap-2 mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onSave({
              override_pattern_id: markedCorrect ? null : selectedPatternId,
              marked_correct: markedCorrect,
            })
          }
          disabled={!canSave}
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        {hasExistingReview && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isSaving}
            className="text-ink-mute hover:text-mark"
          >
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

If shadcn Checkbox isn't installed:

```bash
cd apps/web
pnpm dlx shadcn@latest add checkbox
```

- [ ] **Step 2: Write the failing tests**

Write `apps/web/components/diagnosis/__tests__/edit-panel.test.tsx`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditPanel } from "@/components/diagnosis/edit-panel";
import type { ErrorPattern } from "@/lib/types";

const PATTERNS: ErrorPattern[] = [
  { id: "p1", slug: "p1", name: "Pattern One", category_slug: "execution", category_name: "Execution" },
  { id: "p2", slug: "p2", name: "Pattern Two", category_slug: "conceptual", category_name: "Conceptual" },
];

afterEach(cleanup);

describe("EditPanel — initial state", () => {
  it("renders Save disabled when no review and no inputs", () => {
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();
  });

  it("renders Delete only when there's an existing review", () => {
    const { rerender } = render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    rerender(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={true}
        patterns={PATTERNS}
        hasExistingReview={true}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});

describe("EditPanel — interactions", () => {
  it("checking 'Mark as actually correct' enables Save and disables picker", async () => {
    const user = userEvent.setup();
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /mark this problem as actually correct/i });
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Cancel triggers onCancel without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save with mark-correct calls onSave with correct payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={true}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      override_pattern_id: null,
      marked_correct: true,
    });
  });
});
```

- [ ] **Step 3: Run failing tests**

```bash
pnpm --filter web test -- edit-panel
```

Expected: tests pass once the component is built. If failures, double-check the role names / aria-labels in the test match the component.

- [ ] **Step 4: Run typecheck + lint**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean (0 errors / 2 pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/diagnosis/edit-panel.tsx \
        apps/web/components/diagnosis/__tests__/edit-panel.test.tsx \
        apps/web/components/ui/checkbox.tsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
web: add diagnosis/edit-panel (pattern picker + mark-correct + Save/Cancel/Delete)

Step 11a · inline correction. The "EDITING THIS DIAGNOSIS" panel
content rendered by ProblemRow's column 3 when in editing mode.
Internal state machine for selectedPatternId + markedCorrect; Save
disabled when neither set or both set (XOR rule mirrored from the
backend); checking mark-correct disables and clears the picker.
Delete renders only when re-editing an existing review.

Five vitest cases cover initial state, role-aware Delete affordance,
mark-correct interaction, Cancel callback, and Save payload shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rewrite `<ProblemRow>` as a client component + vitest

**Files:**
- Modify (rewrite): `apps/web/components/diagnosis/problem-row.tsx`
- Create: `apps/web/components/diagnosis/__tests__/problem-row.test.tsx`

- [ ] **Step 1: Read the current `<ProblemRow>` so the rewrite preserves visual structure**

Open `apps/web/components/diagnosis/problem-row.tsx` and note the current grid layout (4 cols), the Steps `<details>` placement, and the `aria-label` patterns. The rewrite reuses the same JSX skeleton.

- [ ] **Step 2: Rewrite the component**

Overwrite `apps/web/components/diagnosis/problem-row.tsx` with:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditPanel } from "@/components/diagnosis/edit-panel";
import { HandwrittenWork } from "@/components/diagnosis/handwritten-work";
import { PrintedSolution } from "@/components/diagnosis/printed-solution";
import { createReview, deleteReview, updateReview } from "@/lib/actions/reviews";
import { notify } from "@/lib/notify";
import type { ErrorPattern, ProblemObservation, Role } from "@/lib/types";

function workLines(answer: string): string[] {
  if (!answer) return [""];
  return answer.split(/\r?\n/);
}

export interface ProblemRowProps {
  problem: ProblemObservation;
  assessmentId: string;
  role: Role;
  errorPatterns: ErrorPattern[];
  context?: "pattern-group" | "reviewed-section";
}

type Mode = "view" | "editing" | "saving";

export function ProblemRow({
  problem,
  assessmentId,
  role,
  errorPatterns,
  context = "pattern-group",
}: ProblemRowProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [, startTransition] = useTransition();

  const hasReview = problem.review !== null;
  const isWrong = !problem.is_correct;
  const isEditable = role === "teacher" && (isWrong || hasReview);
  const hasSteps = !!problem.solution_steps && problem.solution_steps.trim() !== "";
  const isReviewedSection = context === "reviewed-section";

  const initialPatternId = problem.review?.override_pattern_id ?? null;
  const initialMarkedCorrect = problem.review?.marked_correct ?? false;

  function handleSave(payload: { override_pattern_id: string | null; marked_correct: boolean }): void {
    setMode("saving");
    startTransition(async () => {
      try {
        if (problem.review) {
          await updateReview(assessmentId, problem.review.id, payload);
        } else {
          await createReview(assessmentId, {
            problem_number: problem.problem_number,
            ...payload,
          });
        }
        notify.success("Review saved");
        setMode("view");
        router.refresh();
      } catch (err) {
        notify.error("Couldn't save review", {
          description: err instanceof Error ? err.message : undefined,
        });
        setMode("editing");
      }
    });
  }

  function handleDelete(): void {
    if (!problem.review) return;
    setMode("saving");
    startTransition(async () => {
      try {
        await deleteReview(assessmentId, problem.review!.id);
        notify.success("Review removed");
        setMode("view");
        router.refresh();
      } catch (err) {
        notify.error("Couldn't remove review", {
          description: err instanceof Error ? err.message : undefined,
        });
        setMode("editing");
      }
    });
  }

  const isEditing = mode === "editing" || mode === "saving";
  const rowBg = isEditing ? "bg-accent-soft" : "";

  return (
    <article
      id={`problem-${problem.problem_number}`}
      className={`px-8 py-6 border-t border-rule-soft first:border-t-0 ${rowBg}`}
    >
      <div className="grid grid-cols-[60px_1.4fr_1fr_1fr] gap-5 items-start">
        <div className="font-serif italic text-2xl text-ink-mute">
          #{problem.problem_number}
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            {isReviewedSection ? "Their answer" : "Their answer"}
          </p>
          <div className="mt-1">
            <HandwrittenWork lines={workLines(problem.student_answer)} />
          </div>
        </div>

        {isEditing ? (
          <div className="col-span-2">
            <EditPanel
              initialPatternId={initialPatternId}
              initialMarkedCorrect={initialMarkedCorrect}
              patterns={errorPatterns}
              hasExistingReview={hasReview}
              isSaving={mode === "saving"}
              onSave={handleSave}
              onCancel={() => setMode("view")}
              onDelete={hasReview ? handleDelete : undefined}
            />
          </div>
        ) : (
          <>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
                What it should be
              </p>
              <p className="font-serif text-xl text-ink mt-1">
                {isReviewedSection ? "—" : problem.correct_answer}
              </p>
            </div>

            <div>
              {!problem.is_correct && problem.error_description ? (
                <>
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
                    Why
                  </p>
                  <p className="font-sans italic text-sm text-insight mt-1">
                    ↑ {problem.error_description}
                  </p>
                </>
              ) : null}
              {isEditable ? (
                <button
                  type="button"
                  onClick={() => setMode("editing")}
                  className="font-mono text-xs uppercase tracking-[0.1em] text-accent mt-3 inline-block cursor-pointer"
                >
                  Edit ›
                </button>
              ) : null}
              {isEditing ? (
                <span className="font-mono text-xs uppercase tracking-[0.1em] text-accent mt-3 inline-block">
                  Editing…
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {hasSteps && !isEditing ? (
        <details className="mt-4 ml-[80px]">
          <summary className="font-mono text-xs uppercase tracking-[0.1em] text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-block">
            Steps ›
          </summary>
          <div className="mt-3">
            <PrintedSolution steps={problem.solution_steps as string} />
          </div>
        </details>
      ) : null}
    </article>
  );
}
```

The grid template now uses `col-span-2` on the EditPanel cell when editing, which lets the panel occupy columns 3 + 4 (the canvas's "what it should be" + "Why" slots). Column 4 also hosts the `Edit ›` link in view mode and `Editing…` in editing mode.

- [ ] **Step 3: Write the failing tests**

Write `apps/web/components/diagnosis/__tests__/problem-row.test.tsx`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { ErrorPattern, ProblemObservation } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/reviews", () => ({
  createReview: vi.fn(),
  updateReview: vi.fn(),
  deleteReview: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

const PATTERNS: ErrorPattern[] = [
  { id: "p1", slug: "p1", name: "Pattern One", category_slug: "execution", category_name: "Execution" },
];

function makeProblem(overrides: Partial<ProblemObservation> = {}): ProblemObservation {
  return {
    id: "1",
    problem_number: 4,
    page_number: 1,
    student_answer: "x + 2",
    correct_answer: "2x",
    is_correct: false,
    error_pattern_slug: "auto-slug",
    error_pattern_name: "auto",
    error_category_slug: "execution",
    error_description: "auto desc",
    solution_steps: null,
    review: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("ProblemRow — affordance gating", () => {
  it("does not render Edit link for parent role on a wrong row", () => {
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="parent"
        errorPatterns={PATTERNS}
      />,
    );
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });

  it("renders Edit link for teacher role on a wrong row", () => {
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    expect(screen.getByRole("button", { name: /edit ›/i })).toBeInTheDocument();
  });

  it("renders Edit link for teacher when row is correct but has a review", () => {
    render(
      <ProblemRow
        problem={makeProblem({
          is_correct: true,
          review: {
            id: "r1",
            marked_correct: true,
            override_pattern_id: null,
            override_pattern_slug: null,
            override_pattern_name: null,
            note: null,
            reviewed_at: "2026-04-30T00:00:00Z",
            reviewed_by_name: "Jane",
          },
        })}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    expect(screen.getByRole("button", { name: /edit ›/i })).toBeInTheDocument();
  });
});

describe("ProblemRow — edit transitions", () => {
  it("clicking Edit shows the EditPanel", async () => {
    const user = userEvent.setup();
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit ›/i }));
    expect(screen.getByText(/editing this diagnosis/i)).toBeInTheDocument();
  });

  it("Cancel returns to view mode", async () => {
    const user = userEvent.setup();
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit ›/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/editing this diagnosis/i)).toBeNull();
    expect(screen.getByRole("button", { name: /edit ›/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run vitest**

```bash
pnpm --filter web test -- problem-row
```

Expected: 5/5 pass.

- [ ] **Step 5: Run typecheck + lint**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/diagnosis/problem-row.tsx \
        apps/web/components/diagnosis/__tests__/problem-row.test.tsx
git commit -m "$(cat <<'EOF'
web: convert <ProblemRow> to client component with edit-state machine

Step 11a · inline correction. Adds "use client" and the view |
editing | saving state machine. Editable-row predicate is
role === "teacher" && (!is_correct || hasReview) — wrong rows AND
re-edits of marked-correct rows. Click Edit › → row tints
bg-accent-soft, columns 3+4 transform into <EditPanel>, Steps
expand collapses while editing. Save calls createReview /
updateReview server action; delete soft-deletes via deleteReview;
both refresh the page via router.refresh(). notify toasts on
success / failure.

New context prop differentiates pattern-group (default) from
reviewed-section presentation — the latter shows "—" in the
"what it should be" column.

Five vitest cases cover role-aware affordance, mode transitions,
and the cancel path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Modify `<PatternGroup>` to thread role + errorPatterns

**Files:**
- Modify: `apps/web/components/diagnosis/pattern-group.tsx`

- [ ] **Step 1: Read the current `<PatternGroup>` and add the new props**

Open the file and update the props interface + the `<ProblemRow>` invocation:

```typescript
import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { ErrorPattern, Role } from "@/lib/types";
import type { PatternGroup as PatternGroupShape } from "@/lib/diagnosis-sentence";

export function PatternGroup({
  group,
  totalWrong,
  emphasis,
  assessmentId,
  role,
  errorPatterns,
}: {
  group: PatternGroupShape;
  totalWrong: number;
  emphasis: "primary" | "secondary";
  assessmentId: string;
  role: Role;
  errorPatterns: ErrorPattern[];
}) {
  // ... existing eyebrow / count logic unchanged ...

  return (
    <section className="...">
      <header className="...">
        {/* unchanged */}
      </header>
      <div>
        {group.problems.map((p) => (
          <ProblemRow
            key={p.id}
            problem={p}
            assessmentId={assessmentId}
            role={role}
            errorPatterns={errorPatterns}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: type errors at every `<PatternGroup>` callsite (the page hasn't been updated yet — that's Task 16). For now just verify the typecheck error message is the expected "missing required props" at the page-level callsite.

This task's typecheck won't be fully green until Task 16. That's acceptable — we'll commit the partial state and resolve it in Task 16's commit.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/pattern-group.tsx
git commit -m "$(cat <<'EOF'
web: thread assessmentId + role + errorPatterns through <PatternGroup>

Step 11a · inline correction. PatternGroup now accepts and forwards
the props ProblemRow needs for inline edit. Page-level callsite
update lands in the page rewrite task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Modify `<ProblemGrid>` to render ✎ for reviewed problems

**Files:**
- Modify: `apps/web/components/diagnosis/problem-grid.tsx`

- [ ] **Step 1: Update the rendering**

In `apps/web/components/diagnosis/problem-grid.tsx`, replace the inner `sorted.map(p => ...)` body with logic that branches on `p.review !== null`:

```typescript
{sorted.map((p) => {
  const reviewed = p.review !== null;
  const wrong = !p.is_correct;
  const label = reviewed
    ? `Problem ${p.problem_number}: reviewed by teacher`
    : `Problem ${p.problem_number}: ${wrong ? "incorrect" : "correct"}`;

  let containerClass: string;
  let glyphClass: string;
  let glyph: string;

  if (reviewed) {
    containerClass = "border-accent bg-accent-soft hover:bg-[oklch(0.95_0.04_252)] cursor-pointer";
    glyphClass = "text-accent";
    glyph = "✎";
  } else if (wrong) {
    containerClass = "border-insight bg-insight-soft hover:bg-[oklch(0.97_0.04_72)] cursor-pointer";
    glyphClass = "text-insight";
    glyph = "✗";
  } else {
    containerClass = "border-rule bg-paper";
    glyphClass = "text-ink";
    glyph = "✓";
  }

  return (
    <li key={p.id}>
      <a
        href={(reviewed || wrong) ? `#problem-${p.problem_number}` : undefined}
        aria-label={label}
        className={`flex flex-col items-center justify-center aspect-square rounded-[var(--radius-xs)] border ${containerClass}`}
      >
        <span className="font-mono text-xs text-ink-mute" aria-hidden="true">
          #{p.problem_number}
        </span>
        <span className={`font-serif text-sm mt-0.5 ${glyphClass}`} aria-hidden="true">
          {glyph}
        </span>
      </a>
    </li>
  );
})}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: clean (only the page.tsx callsite from Task 16 is still pending).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/problem-grid.tsx
git commit -m "$(cat <<'EOF'
web: render ✎ in <ProblemGrid> for reviewed problems

Step 11a · inline correction. Reviewed squares (review !== null)
get border-accent + bg-accent-soft + ✎ glyph in text-accent. Both
reviewed and wrong squares retain the jump-link href; correct
squares stay non-interactive. aria-label distinguishes "reviewed by
teacher" from "correct" / "incorrect".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: New `<ReviewedSection>` component

**Files:**
- Create: `apps/web/components/diagnosis/reviewed-section.tsx`

- [ ] **Step 1: Create the component**

Write `apps/web/components/diagnosis/reviewed-section.tsx`:

```typescript
import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { ErrorPattern, ProblemObservation, Role } from "@/lib/types";

export function ReviewedSection({
  problems,
  assessmentId,
  role,
  errorPatterns,
}: {
  problems: ProblemObservation[];
  assessmentId: string;
  role: Role;
  errorPatterns: ErrorPattern[];
}) {
  // Filter: review !== null AND effectively correct (mark-correct overrides).
  const reviewed = problems.filter(
    (p) => p.review !== null && p.is_correct,
  );
  if (reviewed.length === 0) return null;

  return (
    <section
      aria-label="Reviewed by teacher"
      className="border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden"
    >
      <header className="bg-paper-soft px-8 py-6 border-b border-rule-soft">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
          Reviewed · marked correct
        </p>
        <p className="font-serif text-base text-ink-soft mt-2">
          Reviewed by teacher
        </p>
      </header>
      <div>
        {reviewed.map((p) => (
          <ProblemRow
            key={p.id}
            problem={p}
            assessmentId={assessmentId}
            role={role}
            errorPatterns={errorPatterns}
            context="reviewed-section"
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: clean (only the page.tsx callsite from Task 16 is still pending).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/reviewed-section.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/reviewed-section (mark-correct re-edit anchor)

Step 11a · inline correction. Renders rows where review !== null
AND is_correct === true — i.e., mark-correct overrides that exited
the pattern-groups area under effective-state semantics. Without
this section, teachers would have no on-page affordance to re-edit
or delete a mark-correct review.

Each row reuses ProblemRow with context="reviewed-section" for
subtly differentiated presentation — "—" instead of correct_answer
in column 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Modify page.tsx — fetch error patterns + render ReviewedSection + thread props

**Files:**
- Modify: `apps/web/app/assessments/[id]/page.tsx`

- [ ] **Step 1: Update imports**

Add to the existing imports:

```typescript
import { ReviewedSection } from "@/components/diagnosis/reviewed-section";
import { fetchAssessmentDetail, fetchErrorPatterns, fetchMe } from "@/lib/api";
import type { ErrorPattern } from "@/lib/types";
```

- [ ] **Step 2: Server-fetch error patterns + thread through CompletedBody**

In the page handler, extend the parallel fetch:

```typescript
const [user, detail, errorPatterns] = await Promise.all([
  fetchMe(),
  fetchAssessmentDetail(id),
  fetchErrorPatterns(),
]);
```

In `<CompletedBody>` props, add `errorPatterns: ErrorPattern[]` and pass it through:

```typescript
function CompletedBody({
  detail,
  role,
  errorPatterns,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof fetchAssessmentDetail>>>;
  role: Role;
  errorPatterns: ErrorPattern[];
}) {
  if (!detail.diagnosis) return null;

  const sentence = buildTopSentence(detail.diagnosis, role);
  const groups = groupProblemsByPattern(detail.diagnosis.problems);
  const totalWrong = detail.diagnosis.problems.filter((p) => !p.is_correct).length;

  return (
    <div className="my-12 flex flex-col gap-12">
      <TopSentence
        studentName={detail.student_name}
        sentence={sentence}
        role={role}
      />

      {groups.length > 0 ? (
        <div className="flex flex-col gap-6">
          {groups.map((g, i) => (
            <PatternGroup
              key={g.slug ?? "other"}
              group={g}
              totalWrong={totalWrong}
              emphasis={i === 0 ? "primary" : "secondary"}
              assessmentId={detail.id}
              role={role}
              errorPatterns={errorPatterns}
            />
          ))}
        </div>
      ) : null}

      <ReviewedSection
        problems={detail.diagnosis.problems}
        assessmentId={detail.id}
        role={role}
        errorPatterns={errorPatterns}
      />

      <ProblemGrid problems={detail.diagnosis.problems} />
    </div>
  );
}
```

`<ReviewedSection>` returns null when no mark-correct reviews exist, so no extra page-level guard is needed.

In the page handler, pass `errorPatterns` to `<CompletedBody>`:

```typescript
{detail.status === "completed" && detail.diagnosis ? (
  <CompletedBody detail={detail} role={role} errorPatterns={errorPatterns} />
) : null}
```

- [ ] **Step 3: Typecheck + lint + test + build**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all clean. typecheck should be clean now that all callsites are wired.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/assessments/[id]/page.tsx
git commit -m "$(cat <<'EOF'
web: wire error patterns + reviewed-section into the diagnosis page

Step 11a · inline correction. Parallel-fetches the error-pattern
list at page render, threads it through CompletedBody → PatternGroup
→ ProblemRow → EditPanel → PatternPicker so the picker has its
options without per-row requests. Adds <ReviewedSection> between
pattern groups and ProblemGrid (renders null when no mark-correct
reviews exist).

Total wrong count derives from the source problem list (not from
group reductions) so the eyebrow stays stable if grouping logic
later changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Manual visual verification

**Files:** none (verification only).

Restart the dev servers if needed: `pnpm dev` from the repo root.

- [ ] **Step 1: Verify scenario 1 — Teacher × wrong row → mark correct**

1. Sign in as a teacher account. Navigate to a completed assessment with at least one wrong problem.
2. Click `Edit ›` on a wrong row → row tints accent-soft, columns 3+4 transform into `<EditPanel>`.
3. Check "Mark as actually correct" → picker disables and shows "Marked correct — no pattern".
4. Click Save → toast appears, row exits its pattern group, appears in `<ReviewedSection>`, bottom grid shows ✎ on its square.
5. Top-sentence score recomputes correctly (effective state proof).

- [ ] **Step 2: Verify scenario 2 — Override pattern**

1. Click `Edit ›` on a different wrong row.
2. Use the picker to select a different pattern from a different category.
3. Save → row reappears in the override pattern's group; bottom grid shows ✎.

- [ ] **Step 3: Verify scenario 3 — Re-edit and delete**

1. In `<ReviewedSection>`, click `Edit ›` on the mark-correct row from scenario 1.
2. Click Delete → toast, row reverts to its original wrong state in pattern groups; bottom grid shows ✗ again.

- [ ] **Step 4: Verify scenario 4 — Parent role**

1. Sign in as a parent account.
2. Navigate to a completed assessment.
3. Confirm: no `Edit ›` link anywhere; no `<ReviewedSection>`; bottom grid renders only ✓/✗ (no ✎).

- [ ] **Step 5: Verify scenario 5 — 403 enforcement (DevTools)**

Open DevTools → Network. Attempt POST to `/api/assessments/{id}/reviews` with the parent user's token via curl or Fetch:

```js
fetch("/api/assessments/<id>/reviews", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer <parent-token>" },
  body: JSON.stringify({ problem_number: 1, marked_correct: true })
}).then(r => r.status)
```

Expected: 403.

- [ ] **Step 6: Note any deviations**

If anything in scenarios 1–5 doesn't match, capture a screenshot to `assets/screenshots/step-11a-{scenario}.png`. Decide whether to fix in the same PR or open a follow-up.

This task does not produce a commit unless deviations require fixes.

---

## Task 17: Open the PR via gh CLI

**Files:** none.

Per the updated workflow (memory feedback_workflow.md): the agent runs `gh pr create` and `gh pr merge` directly; David approves the diff, agent merges.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..HEAD
```

Expected: spec commit (`d59af3b`) plus 15 task commits.

- [ ] **Step 2: Push the latest**

```bash
git push
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --title "Step 11a · Inline correction (backend + edit panel)" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

Adds the `diagnostic_reviews` table + service overlay + 3-endpoint CRUD router on the backend, exposes `GET /api/error-patterns`, and ships the teacher-facing inline edit panel on `<ProblemRow>` with a `<ReviewedSection>` for mark-correct reviews. Step 11b (the side-by-side viewer) is a separate PR.

## Why

Step 11a of the v2 design build. Step 10 established the editorial diagnosis page; this is the first step that lets teachers act on it. The canvas's "Editing" column-transform is one of the four core moves on the diagnosis page (the others — top sentence, pattern groups, problem rows — landed in Step 10).

## What changed

- **Backend.** New `diagnostic_reviews` table (alembic + SQLAlchemy model). Pydantic schemas with mark-correct XOR override-pattern validator. POST/PATCH/DELETE router under `/api/assessments/{id}/reviews` with strict org-match auth (parents → 403). Audit-log writes on every CRUD action. Service overlay applies active reviews to `ProblemObservation` rows in the assessment-detail GET response so existing fields represent EFFECTIVE post-review state. New `GET /api/error-patterns` endpoint feeds the picker.
- **Frontend.** `<ProblemRow>` becomes a `"use client"` component with internal state machine. New `<EditPanel>` + `<PatternPicker>` + `<ReviewedSection>` components. `<ProblemGrid>` shows ✎ for reviewed problems. Server actions in `lib/actions/reviews.ts` handle CRUD via Clerk-authenticated fetch.
- Step 10 helpers (`buildTopSentence`, `groupProblemsByPattern`) and components (`<TopSentence>`, `<PatternGroup>`, `<HandwrittenWork>`, `<PrintedSolution>`) consume effective state transparently — no logic changes.

## How to verify

`pnpm --filter api test`, `mypy`, `pnpm --filter web test`, `typecheck`, `lint`, `build` — all clean. Open `/assessments/{id}` as a teacher and:
- Click `Edit ›` on a wrong row → editing UI in column 3+4, row tints accent-soft.
- Save with mark-correct → row exits pattern group, appears in `<ReviewedSection>`, bottom grid shows ✎, score recomputes.
- Save with override pattern → row reappears under new pattern's group.
- Re-edit and Delete → row reverts.
- As parent → no Edit affordance anywhere.
- DevTools 403 path on parent POST.

## Out of scope

- `/assessments/[id]/viewer` side-by-side with key — Step 11b.
- Engine emission of bounding boxes for the viewer's wrong-line highlight — Step 11b's design problem.
- Edit on already-correct rows (auto-graded correct → teacher says wrong) — not in handoff schema; defer.
- Free-form `note` UI surface — schema-only in v1.
- Confirmation modal on Delete — reviews are reversible.
- Bulk-edit, concurrency handling, longitudinal review stats — future.

## Notes

Spec at `docs/superpowers/specs/2026-04-30-step-11a-inline-correction-design.md`. Plan at `docs/superpowers/plans/2026-04-30-step-11a-inline-correction.md`. The `<ReviewedSection>` is a deliberate v1 addition not in the canvas — solves the "where do mark-correct rows go on the page" architectural gap; spec §Architecture flags it. Privacy commitment honored: `audit_log` writes on every review CRUD; org-match denies parents on the strict predicate.
EOF
)"
```

- [ ] **Step 4: Wait for David's review**

Do not run `gh pr merge` until David approves the PR diff. He may comment, request changes, or say "merge" / "lgtm" / "ship it" — only then run:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull
```

Then mark this task done.

---

## Self-Review

**1. Spec coverage**

| Spec section | Plan task |
|---|---|
| §Components: `diagnostic_reviews` table + model | Task 1 |
| §Components: pydantic schemas | Task 2 |
| §Components: service overlay (`apply_reviews_to_problems`) | Task 3 |
| §Components: GET `/api/error-patterns` router | Task 4 |
| §Components: POST/PATCH/DELETE `/api/assessments/{id}/reviews` router | Task 5 |
| §Components: assessments router GET applies overlay; `ProblemObservation.review` field | Task 6 |
| §Components: lib/types.ts `DiagnosticReview` + `review` field | Task 7 |
| §Components: `lib/api.ts` `fetchErrorPatterns` | Task 7 |
| §Components: `lib/actions/reviews.ts` server actions | Task 8 |
| §Components: `<PatternPicker>` | Task 9 |
| §Components: `<EditPanel>` (+ vitest) | Task 10 |
| §Components: `<ProblemRow>` rewrite (+ vitest) | Task 11 |
| §Components: `<PatternGroup>` modify | Task 12 |
| §Components: `<ProblemGrid>` modify (✎) | Task 13 |
| §Components: `<ReviewedSection>` | Task 14 |
| §Components: `page.tsx` modify (fetch patterns + render section) | Task 15 |
| §Schema details (alembic + unique partial index) | Task 1 |
| §Pydantic validators (XOR mark-correct vs override-pattern) | Task 2 (schema) + Task 5 (PATCH re-validation) |
| §Service overlay logic (3 review states) | Task 3 |
| §Authorization (strict org-match predicate) | Task 5 |
| §Audit logging | Task 5 |
| §Frontend state machine | Task 11 |
| §Edit panel UX (column transform, validation) | Task 10 + Task 11 |
| §Pattern picker UX (shadcn Select grouped by category) | Task 9 |
| §`<ReviewedSection>` filter + presentation | Task 14 |
| §Toast feedback | Task 11 |
| §Testing checklist | Backend tasks 1, 3, 4, 5, 6 add pytest; frontend tasks 10, 11 add vitest; Task 16 covers manual visual |
| §Verification checklist | Task 16 (manual) + per-task gates |

All requirements covered.

**2. Placeholder scan**

One soft placeholder in Task 6 Step 3: "If sketching the test takes more than 30 minutes, mark this task DONE_WITH_CONCERNS — leave the placeholder, ship the overlay logic, and follow up." This is acceptable practice — backend integration tests for assessment-router require seeding a complete diagnosis row, which is genuinely involved and the existing helpers in that test file may already include patterns to copy. Implementer judgment is called for. The remaining tasks have full code blocks.

**3. Type consistency**

- `DiagnosticReview` (TS) ↔ `DiagnosticReviewOut` (Python) — fields match (id, marked_correct, override_pattern_id, override_pattern_slug, override_pattern_name, note, reviewed_at, reviewed_by_name).
- `ErrorPattern` (TS) ↔ `ErrorPatternOut` (Python) — fields match (id, slug, name, category_slug, category_name).
- `ProblemObservation.review` field added in both Task 6 (Python schema) and Task 7 (TS type).
- `Role` type referenced in Tasks 11, 12, 14, 15 — sourced from `@/lib/diagnosis-sentence` per Step 10's existing convention.
- Server actions `createReview` / `updateReview` / `deleteReview` in Task 8 referenced consistently in Task 11.
- `<EditPanel>` props from Task 10 match the call in Task 11.
- `<ProblemRow>` props from Task 11 match the calls in Tasks 12 (`<PatternGroup>`) and 14 (`<ReviewedSection>`).
- `<PatternGroup>` props from Task 12 match the call in Task 15.

All names and signatures consistent across tasks.
