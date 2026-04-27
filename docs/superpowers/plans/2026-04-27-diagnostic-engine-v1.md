# Diagnostic Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Claude Sonnet 4.6 vision against multi-page assessments, with the v1 taxonomy in a prompt-cached system message, returning per-problem grade + error pattern + step-by-step solution.

**Architecture:** Two new tables (`assessment_diagnoses` 1:1, `problem_observations` N per diagnosis), one Alembic migration, one new `engine_service.py` module that orchestrates the call, one new `claude_service.call_vision_multi` extension to support N images and prompt caching, one new `POST /api/assessments/{id}/diagnose` endpoint, and frontend additions on `/assessments/[id]` (a "Run diagnostic" button + a `DiagnosisDisplay` component above the page images).

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy 2 async + Alembic + asyncpg + Anthropic Python SDK; Next.js 16 (App Router) + Tailwind 4 + shadcn/ui.

---

## Reference Documents

- `docs/superpowers/specs/2026-04-27-diagnostic-engine-v1-design.md` — the spec.
- `docs/superpowers/specs/2026-04-25-error-taxonomy-v1.md` — the v1 taxonomy this engine consumes.
- `apps/api/src/grade_sight_api/services/claude_service.py` — existing Claude wrapper (we extend with `call_vision_multi`).
- `apps/api/src/grade_sight_api/services/storage_service.py` — `get_download_url` for presigned R2 GETs.
- `apps/api/src/grade_sight_api/models/{error_category,error_subcategory,error_pattern}.py` — taxonomy models with `slug`, `name`, `definition`, `description`, `distinguishing_marker`.
- `apps/api/src/grade_sight_api/models/assessment.py` — parent model + status enum.
- `apps/api/src/grade_sight_api/routers/assessments.py` — existing router we extend with the diagnose endpoint + GET response shape.
- `apps/api/alembic/versions/aa1af53df147_drop_legacy_assessment_columns.py` — current head.
- `apps/web/app/assessments/[id]/page.tsx` — detail page we extend.

## Pre-merge checklist (every task)

1. `cd apps/api && ~/.local/bin/uv run ruff check` — clean.
2. `cd apps/api && ~/.local/bin/uv run mypy src tests` — clean.
3. `cd apps/api && ~/.local/bin/uv run pytest -q` — all default tests pass.
4. `cd apps/web && pnpm lint && pnpm typecheck` — clean (frontend tasks).
5. Commit: imperative subject, body explains *why*, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Build-broken intermediate state

None expected. Tasks 1-4 are additive on the backend (no breaking shape changes — `diagnosis: ... | null` is added to the GET response in Task 4 but doesn't break existing consumers). Tasks 5-6 add new frontend components; they wire into the detail page in Task 6 without breaking anything.

---

## Task 1: Schema (models + Alembic migration + 3 model tests)

**Files:**
- Create: `apps/api/src/grade_sight_api/models/assessment_diagnosis.py`
- Create: `apps/api/src/grade_sight_api/models/problem_observation.py`
- Modify: `apps/api/src/grade_sight_api/models/__init__.py` (add re-exports)
- Modify: `apps/api/src/grade_sight_api/models/assessment.py` (add `diagnosis` relationship)
- Create: `apps/api/alembic/versions/<auto>_add_diagnostic_engine_tables.py`
- Create: `apps/api/tests/models/test_assessment_diagnosis.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/models/test_assessment_diagnosis.py`:

```python
"""Tests for AssessmentDiagnosis + ProblemObservation models."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_assessment_and_pattern(
    session: AsyncSession,
) -> tuple[Organization, Assessment, ErrorPattern]:
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
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    session.add(student)
    await session.flush()
    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    session.add(asmt)
    cat = ErrorCategory(
        slug="execution",
        name="Execution",
        definition="execution errors",
        distinguishing_marker="visible math step error",
        severity_rank=2,
    )
    session.add(cat)
    await session.flush()
    sub = ErrorSubcategory(
        slug="execution-arithmetic",
        category_id=cat.id,
        name="Arithmetic",
        definition="arithmetic mistakes",
    )
    session.add(sub)
    await session.flush()
    pat = ErrorPattern(
        slug="sign-error-distribution",
        subcategory_id=sub.id,
        name="Sign error in distribution",
        description="Lost a sign while distributing",
        canonical_example="-2(x-4)=6 -> -2x-8=6",
        severity_hint="medium",
    )
    session.add(pat)
    await session.flush()
    return org, asmt, pat


async def test_diagnosis_round_trip(async_session: AsyncSession) -> None:
    org, asmt, _ = await _seed_assessment_and_pattern(async_session)
    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=12345,
        tokens_output=678,
        tokens_cache_read=10000,
        tokens_cache_creation=2345,
        cost_usd=Decimal("0.045123"),
        latency_ms=23456,
        overall_summary="3 of 5 correct.",
    )
    async_session.add(diag)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].model == "claude-sonnet-4-6"
    assert rows[0].cost_usd == Decimal("0.045123")
    assert rows[0].overall_summary == "3 of 5 correct."


async def test_diagnosis_unique_per_assessment(
    async_session: AsyncSession,
) -> None:
    org, asmt, _ = await _seed_assessment_and_pattern(async_session)
    diag_a = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=1,
        tokens_output=1,
        cost_usd=Decimal("0.01"),
        latency_ms=100,
    )
    diag_b = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=2,
        tokens_output=2,
        cost_usd=Decimal("0.02"),
        latency_ms=200,
    )
    async_session.add(diag_a)
    async_session.add(diag_b)

    with pytest.raises(IntegrityError):
        await async_session.flush()


async def test_problem_observation_round_trip(
    async_session: AsyncSession,
) -> None:
    org, asmt, pat = await _seed_assessment_and_pattern(async_session)
    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=1,
        tokens_output=1,
        cost_usd=Decimal("0.01"),
        latency_ms=100,
    )
    async_session.add(diag)
    await async_session.flush()

    obs_correct = ProblemObservation(
        diagnosis_id=diag.id,
        organization_id=org.id,
        problem_number=1,
        page_number=1,
        student_answer="x = 7",
        correct_answer="x = 7",
        is_correct=True,
    )
    obs_wrong = ProblemObservation(
        diagnosis_id=diag.id,
        organization_id=org.id,
        problem_number=2,
        page_number=1,
        student_answer="x = 5",
        correct_answer="x = 7",
        is_correct=False,
        error_pattern_id=pat.id,
        error_description="Lost a negative sign during distribution.",
        solution_steps="1. -2(x-4)=6\n2. -2x+8=6\n3. x=1",
    )
    async_session.add(obs_correct)
    async_session.add(obs_wrong)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(ProblemObservation)
            .where(ProblemObservation.diagnosis_id == diag.id)
            .order_by(ProblemObservation.problem_number)
        )
    ).scalars().all()
    assert len(rows) == 2
    assert rows[0].is_correct is True
    assert rows[0].error_pattern_id is None
    assert rows[1].is_correct is False
    assert rows[1].error_pattern_id == pat.id
    assert rows[1].solution_steps is not None
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/models/test_assessment_diagnosis.py -v
```

Expected: 3 tests FAIL with `ImportError: cannot import name 'AssessmentDiagnosis'`.

- [ ] **Step 3: Create the AssessmentDiagnosis model**

Create `apps/api/src/grade_sight_api/models/assessment_diagnosis.py`:

```python
"""AssessmentDiagnosis — engine output for one Assessment.

1:1 with Assessment in v1 (UNIQUE constraint on assessment_id; re-run
deferred to a follow-up spec). Owns N ProblemObservation rows.

Model + prompt_version stamped on every row so we can bucket results by
prompt era when we iterate. Cost / token / cache columns power the
existing Claude cost analytics.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .assessment import Assessment
    from .problem_observation import ProblemObservation


class AssessmentDiagnosis(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "assessment_diagnoses"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    model: Mapped[str] = mapped_column(nullable=False)
    prompt_version: Mapped[str] = mapped_column(nullable=False)
    tokens_input: Mapped[int] = mapped_column(nullable=False)
    tokens_output: Mapped[int] = mapped_column(nullable=False)
    tokens_cache_read: Mapped[int | None] = mapped_column(nullable=True)
    tokens_cache_creation: Mapped[int | None] = mapped_column(nullable=True)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    latency_ms: Mapped[int] = mapped_column(nullable=False)
    overall_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    assessment: Mapped[Assessment] = relationship(
        "Assessment",
        back_populates="diagnosis",
        lazy="select",
    )
    observations: Mapped[list[ProblemObservation]] = relationship(
        "ProblemObservation",
        back_populates="diagnosis",
        order_by="ProblemObservation.problem_number",
        lazy="selectin",
    )
```

- [ ] **Step 4: Create the ProblemObservation model**

Create `apps/api/src/grade_sight_api/models/problem_observation.py`:

```python
"""ProblemObservation — one engine-classified problem inside a diagnosis.

is_correct=true rows have only student_answer + correct_answer populated
(usually equal). is_correct=false rows additionally have error_description
and solution_steps. error_pattern_id is set when the engine matched the
error to a taxonomy slug; nullable when the engine couldn't classify but
still saw the wrong answer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .assessment_diagnosis import AssessmentDiagnosis


class ProblemObservation(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "problem_observations"
    __table_args__ = (
        UniqueConstraint(
            "diagnosis_id",
            "problem_number",
            name="uq_problem_observations_diagnosis_id_problem_number",
        ),
        Index("ix_problem_observations_diagnosis_id", "diagnosis_id"),
        Index("ix_problem_observations_error_pattern_id", "error_pattern_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    diagnosis_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessment_diagnoses.id", ondelete="RESTRICT"),
        nullable=False,
    )
    problem_number: Mapped[int] = mapped_column(nullable=False)
    page_number: Mapped[int] = mapped_column(nullable=False)
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(nullable=False)
    error_pattern_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("error_patterns.id", ondelete="RESTRICT"),
        nullable=True,
    )
    error_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution_steps: Mapped[str | None] = mapped_column(Text, nullable=True)

    diagnosis: Mapped[AssessmentDiagnosis] = relationship(
        "AssessmentDiagnosis",
        back_populates="observations",
        lazy="select",
    )
```

- [ ] **Step 5: Add `diagnosis` relationship to the Assessment model**

In `apps/api/src/grade_sight_api/models/assessment.py`, find the existing TYPE_CHECKING block and add:

```python
if TYPE_CHECKING:
    from .assessment_diagnosis import AssessmentDiagnosis  # NEW
    from .assessment_page import AssessmentPage
```

After the `pages` relationship in the `Assessment` class, add:

```python
    diagnosis: Mapped[AssessmentDiagnosis | None] = relationship(
        "AssessmentDiagnosis",
        back_populates="assessment",
        uselist=False,
        lazy="select",
    )
```

(Note `uselist=False` for the 1:1 shape, and `lazy="select"` so the GET-list query doesn't auto-load it.)

- [ ] **Step 6: Re-export the new models in `models/__init__.py`**

Modify `apps/api/src/grade_sight_api/models/__init__.py`. Add the imports in alphabetical order:

```python
from .answer_key import AnswerKey
from .assessment import Assessment, AssessmentStatus
from .assessment_diagnosis import AssessmentDiagnosis  # NEW
from .assessment_page import AssessmentPage
from .audit_log import AuditLog
from .class_member import ClassMember
from .error_category import ErrorCategory
from .error_pattern import ErrorPattern
from .error_subcategory import ErrorSubcategory
from .klass import Klass
from .llm_call_log import LLMCallLog
from .organization import Organization
from .problem_observation import ProblemObservation  # NEW
from .student import Student
from .student_profile import StudentProfile
from .subscription import Plan, Subscription, SubscriptionStatus
from .subscription_event import SubscriptionEvent
from .user import User, UserRole
```

Add to the `__all__` list in alphabetical order:

```python
__all__ = [
    "AnswerKey",
    "Assessment",
    "AssessmentDiagnosis",  # NEW
    "AssessmentPage",
    "AssessmentStatus",
    "AuditLog",
    "ClassMember",
    "ErrorCategory",
    "ErrorPattern",
    "ErrorSubcategory",
    "Klass",
    "LLMCallLog",
    "Organization",
    "Plan",
    "ProblemObservation",  # NEW
    "Student",
    "StudentProfile",
    "Subscription",
    "SubscriptionEvent",
    "SubscriptionStatus",
    "User",
    "UserRole",
]
```

- [ ] **Step 7: Generate the Alembic migration**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run alembic revision --autogenerate -m "add diagnostic engine tables"
```

Open the generated file at `apps/api/alembic/versions/<rev>_add_diagnostic_engine_tables.py`. Replace `upgrade()` and `downgrade()` with this exact content (preserve the auto-generated `revision` and `Create Date`):

```python
"""add diagnostic engine tables

Revision ID: <KEEP GENERATED>
Revises: aa1af53df147
Create Date: <KEEP GENERATED>

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "<KEEP GENERATED>"
down_revision: Union[str, Sequence[str], None] = "aa1af53df147"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assessment_diagnoses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("prompt_version", sa.String(), nullable=False),
        sa.Column("tokens_input", sa.Integer(), nullable=False),
        sa.Column("tokens_output", sa.Integer(), nullable=False),
        sa.Column("tokens_cache_read", sa.Integer(), nullable=True),
        sa.Column("tokens_cache_creation", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("overall_summary", sa.Text(), nullable=True),
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
            ["assessment_id"],
            ["assessments.id"],
            name=op.f("fk_assessment_diagnoses_assessment_id_assessments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_assessment_diagnoses_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assessment_diagnoses")),
        sa.UniqueConstraint(
            "assessment_id",
            name=op.f("uq_assessment_diagnoses_assessment_id"),
        ),
    )
    op.create_table(
        "problem_observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("diagnosis_id", sa.Uuid(), nullable=False),
        sa.Column("problem_number", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("student_answer", sa.Text(), nullable=False),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("error_pattern_id", sa.Uuid(), nullable=True),
        sa.Column("error_description", sa.Text(), nullable=True),
        sa.Column("solution_steps", sa.Text(), nullable=True),
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
            ["diagnosis_id"],
            ["assessment_diagnoses.id"],
            name=op.f("fk_problem_observations_diagnosis_id_assessment_diagnoses"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["error_pattern_id"],
            ["error_patterns.id"],
            name=op.f("fk_problem_observations_error_pattern_id_error_patterns"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_problem_observations_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_problem_observations")),
        sa.UniqueConstraint(
            "diagnosis_id",
            "problem_number",
            name="uq_problem_observations_diagnosis_id_problem_number",
        ),
    )
    op.create_index(
        "ix_problem_observations_diagnosis_id",
        "problem_observations",
        ["diagnosis_id"],
        unique=False,
    )
    op.create_index(
        "ix_problem_observations_error_pattern_id",
        "problem_observations",
        ["error_pattern_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_problem_observations_error_pattern_id",
        table_name="problem_observations",
    )
    op.drop_index(
        "ix_problem_observations_diagnosis_id",
        table_name="problem_observations",
    )
    op.drop_table("problem_observations")
    op.drop_table("assessment_diagnoses")
```

If autogen produced any unrelated `op.add_column` / `op.alter_column` / `op.drop_*` calls (it shouldn't — the only schema change is two new tables), DELETE them.

- [ ] **Step 8: Apply the migration to dev + test DBs**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run alembic upgrade head
DATABASE_URL=postgresql+asyncpg://exexporerporer@localhost:5432/grade_sight_test ~/.local/bin/uv run alembic upgrade head
```

Both should end with `Running upgrade aa1af53df147 -> <new rev>, add diagnostic engine tables`. Replace `exexporerporer` with the actual local pg user if different (this matches the Spec 10 Task 1 + Task 2 pattern; same convention).

- [ ] **Step 9: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/models/test_assessment_diagnosis.py -v
```

Expected: 3 PASSED.

- [ ] **Step 10: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total tests: ~58 prior + 3 new = ~61 passed, 2 skipped. (Implementer should confirm actual baseline.)

- [ ] **Step 11: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/models/assessment_diagnosis.py apps/api/src/grade_sight_api/models/problem_observation.py apps/api/src/grade_sight_api/models/__init__.py apps/api/src/grade_sight_api/models/assessment.py apps/api/alembic/versions/*_add_diagnostic_engine_tables.py apps/api/tests/models/test_assessment_diagnosis.py
git commit -m "$(cat <<'EOF'
Add assessment_diagnoses + problem_observations tables

Two new tables for the v1 diagnostic engine:
- assessment_diagnoses (1:1 with Assessment, UNIQUE on assessment_id)
  carries the model, prompt_version, token / cache / cost / latency
  metadata, and an optional overall_summary.
- problem_observations (N per diagnosis, UNIQUE on
  (diagnosis_id, problem_number)) carries per-problem grade,
  engine-derived correct answer, optional error_pattern_id (taxonomy
  FK, nullable when engine couldn't classify), error_description,
  solution_steps. Indexed on diagnosis_id and error_pattern_id for
  the longitudinal pattern queries we'll want later.

Bidirectional back_populates between Assessment.diagnosis and
AssessmentDiagnosis.assessment matches the codebase convention.

Three model tests: round-trip, UNIQUE-per-assessment violation, and
correct-vs-wrong observation shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `claude_service.call_vision_multi` extension

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/claude_service.py` (add `call_vision_multi`)
- Create: `apps/api/tests/services/test_claude_service_vision_multi.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/services/test_claude_service_vision_multi.py`:

```python
"""Tests for claude_service.call_vision_multi (extension to support N images
+ optional prompt caching on the system block)."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


def _build_mock_anthropic_response() -> MagicMock:
    """Mimic the shape of anthropic's MessageResponse."""
    block = MagicMock()
    block.text = '{"problems": []}'
    response = MagicMock()
    response.content = [block]
    response.usage = MagicMock()
    response.usage.input_tokens = 100
    response.usage.output_tokens = 20
    return response


async def test_call_vision_multi_with_cache_system_marks_cache_control(
    async_session: AsyncSession,
) -> None:
    """When cache_system=True, the system block has cache_control: ephemeral."""
    fake_response = _build_mock_anthropic_response()
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=fake_response)

    ctx = CallContext(
        organization_id=uuid4(),
        user_id=uuid4(),
        request_type="diagnostic_engine",
        contains_pii=True,
        audit_reason="test multi vision call",
    )

    with patch.object(
        claude_service, "_get_client", return_value=mock_client
    ):
        await claude_service.call_vision_multi(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="taxonomy goes here",
            images=["https://example.com/page1.png", "https://example.com/page2.png"],
            prompt="Diagnose this assessment.",
            max_tokens=4096,
            cache_system=True,
            db=async_session,
        )

    assert mock_client.messages.create.await_count == 1
    kwargs = mock_client.messages.create.await_args.kwargs

    # System block must carry cache_control: ephemeral.
    system = kwargs["system"]
    assert isinstance(system, list)
    assert len(system) == 1
    assert system[0]["type"] == "text"
    assert system[0]["text"] == "taxonomy goes here"
    assert system[0]["cache_control"] == {"type": "ephemeral"}

    # User message must contain 2 image blocks + 1 text block.
    messages = kwargs["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    content = messages[0]["content"]
    assert len([b for b in content if b["type"] == "image"]) == 2
    assert len([b for b in content if b["type"] == "text"]) == 1


async def test_call_vision_multi_without_cache_uses_string_system(
    async_session: AsyncSession,
) -> None:
    """When cache_system=False, the system parameter is a plain string."""
    fake_response = _build_mock_anthropic_response()
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=fake_response)

    ctx = CallContext(
        organization_id=uuid4(),
        user_id=uuid4(),
        request_type="diagnostic_engine",
        contains_pii=False,
        audit_reason="no-cache test",
    )

    with patch.object(
        claude_service, "_get_client", return_value=mock_client
    ):
        await claude_service.call_vision_multi(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="plain string system",
            images=["https://example.com/p.png"],
            prompt="Diagnose.",
            max_tokens=4096,
            cache_system=False,
            db=async_session,
        )

    kwargs = mock_client.messages.create.await_args.kwargs
    assert kwargs["system"] == "plain string system"
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/services/test_claude_service_vision_multi.py -v
```

Expected: 2 tests FAIL with `AttributeError: module 'grade_sight_api.services.claude_service' has no attribute 'call_vision_multi'`.

- [ ] **Step 3: Implement `call_vision_multi`**

In `apps/api/src/grade_sight_api/services/claude_service.py`, add this function at the bottom of the file (after the existing `call_vision`):

```python
def _build_multi_vision_message(
    images: list[bytes | str], prompt: str
) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    for image in images:
        if isinstance(image, bytes):
            source: dict[str, Any] = {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.b64encode(image).decode("ascii"),
            }
        else:
            source = {"type": "url", "url": image}
        content.append({"type": "image", "source": source})
    content.append({"type": "text", "text": prompt})
    return {"role": "user", "content": content}


async def call_vision_multi(
    *,
    ctx: CallContext,
    model: str,
    system: str,
    images: list[bytes | str],
    prompt: str,
    max_tokens: int,
    db: AsyncSession,
    cache_system: bool = False,
) -> ClaudeVisionResponse:
    """Call Claude with N images + a prompt.

    `images` accepts a mix of raw bytes (sent as base64) and URL strings.
    When cache_system=True, the system parameter is sent as a list with
    cache_control: ephemeral on the single text block, enabling prompt
    caching (~5-min TTL) for the static taxonomy injection.

    Writes LLMCallLog on every attempt and audit_log when ctx.contains_pii.
    """
    client = _get_client()
    user_message = _build_multi_vision_message(images, prompt)
    typed_message = cast(anthropic.types.MessageParam, user_message)

    system_param: Any
    if cache_system:
        system_param = [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ]
    else:
        system_param = system

    async def _attempt() -> Any:
        return await client.messages.create(
            model=model,
            system=system_param,
            messages=[typed_message],
            max_tokens=max_tokens,
        )

    start = time.monotonic()
    try:
        response = await _with_retries(_attempt)
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        await write_llm_call_log(
            db,
            ctx=ctx,
            model=model,
            tokens_input=0,
            tokens_output=0,
            cost_usd=Decimal("0"),
            latency_ms=latency_ms,
            success=False,
            error_message=f"{type(exc).__name__}: {exc}",
        )
        raise ClaudeServiceError(str(exc)) from exc

    latency_ms = int((time.monotonic() - start) * 1000)
    text_blocks = [block.text for block in response.content if hasattr(block, "text")]
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens
    cost = compute_cost(model=model, tokens_input=tokens_in, tokens_output=tokens_out)

    await write_llm_call_log(
        db,
        ctx=ctx,
        model=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        cost_usd=cost,
        latency_ms=latency_ms,
        success=True,
    )

    if ctx.contains_pii:
        await write_audit_log(
            db,
            ctx=ctx,
            resource_type="claude_call",
            resource_id=None,
            action="claude_vision_multi_call",
            extra={
                "model": model,
                "tokens_input": tokens_in,
                "tokens_output": tokens_out,
                "image_count": len(images),
                "cache_system": cache_system,
            },
        )

    return ClaudeVisionResponse(
        text="".join(text_blocks),
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        model=model,
    )
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/services/test_claude_service_vision_multi.py -v
```

Expected: 2 PASSED.

- [ ] **Step 5: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~63 passed, 2 skipped.

- [ ] **Step 6: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/services/claude_service.py apps/api/tests/services/test_claude_service_vision_multi.py
git commit -m "$(cat <<'EOF'
Extend claude_service with call_vision_multi

New function for multi-image vision calls. Builds a single user
message with N image content blocks (URL or base64) plus the prompt
text. When cache_system=True, sends the system parameter as a list
with cache_control: ephemeral on the text block, enabling Anthropic
prompt caching (~5-min TTL) — important for the diagnostic engine
where the taxonomy injection is the largest input chunk.

Same retry / audit_log / llm_call_log behavior as the existing single-
image call_vision. Audit log action is "claude_vision_multi_call"
with image_count and cache_system metadata.

Two tests: cache_system=True wraps system in the cache_control list
shape; cache_system=False keeps it as a plain string. Both verify the
underlying messages.create call args via patched _get_client.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `engine_service` (module + 8 unit tests + minimal taxonomy fixture)

**Files:**
- Create: `apps/api/src/grade_sight_api/services/engine_service.py`
- Modify: `apps/api/tests/conftest.py` (add `seed_minimal_taxonomy` fixture)
- Create: `apps/api/tests/services/test_engine_service.py`

- [ ] **Step 1: Add the `seed_minimal_taxonomy` fixture to `conftest.py`**

Open `apps/api/tests/conftest.py`. Add this fixture (placement: alongside other shared fixtures; if the file has imports, add the imports; if it doesn't have a `seed_*` section, just append):

```python
import pytest_asyncio  # if not already imported

from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory


@pytest_asyncio.fixture
async def seed_minimal_taxonomy(async_session):
    """Seed 1 category + 1 subcategory + 1 pattern with known slugs.

    Used by engine_service tests that need a taxonomy row to look up by
    slug. Production seed (4/16/29) lives in apps/api/scripts/.
    """
    cat = ErrorCategory(
        slug="execution",
        name="Execution",
        definition="Errors during the mechanical steps of solving.",
        distinguishing_marker="Visible mistake in the math itself.",
        severity_rank=2,
    )
    async_session.add(cat)
    await async_session.flush()
    sub = ErrorSubcategory(
        slug="execution-arithmetic",
        category_id=cat.id,
        name="Arithmetic",
        definition="Arithmetic mistakes during a problem's solution.",
    )
    async_session.add(sub)
    await async_session.flush()
    pat = ErrorPattern(
        slug="sign-error-distribution",
        subcategory_id=sub.id,
        name="Sign error in distribution",
        description="Lost a sign while distributing a coefficient.",
        canonical_example="-2(x-4)=6 -> -2x-8=6 (incorrect)",
        severity_hint="medium",
    )
    async_session.add(pat)
    await async_session.flush()
    return {"category": cat, "subcategory": sub, "pattern": pat}
```

If `pytest_asyncio` isn't already imported, add the import. If the existing fixtures use `@pytest.fixture` instead of `@pytest_asyncio.fixture`, match the existing style.

- [ ] **Step 2: Write the failing engine_service tests**

Create `apps/api/tests/services/test_engine_service.py`:

```python
"""Tests for engine_service.diagnose_assessment.

All 8 tests mock claude_service.call_vision_multi to return a
ClaudeVisionResponse with a known JSON string. This bypasses the entire
claude_service / Anthropic path; claude_service has its own tests.
"""

from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole
from grade_sight_api.services import claude_service, engine_service
from grade_sight_api.services.claude_service import (
    ClaudeServiceError,
    ClaudeVisionResponse,
)


async def _seed_assessment_with_pages(
    session: AsyncSession, *, page_count: int = 2, status: AssessmentStatus = AssessmentStatus.pending,
) -> tuple[Organization, User, Assessment]:
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
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    session.add(student)
    await session.flush()
    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=status,
    )
    session.add(asmt)
    await session.flush()
    for n in range(1, page_count + 1):
        session.add(
            AssessmentPage(
                assessment_id=asmt.id,
                page_number=n,
                s3_url=f"assessments/{org.id}/{student.id}/{asmt.id}/page-{n:03d}.png",
                original_filename=f"page-{n}.png",
                content_type="image/png",
                organization_id=org.id,
            )
        )
    await session.flush()
    return org, user, asmt


def _engine_response_three_problems(pattern_slug: str) -> str:
    return json.dumps(
        {
            "overall_summary": "2 of 3 correct.",
            "problems": [
                {
                    "problem_number": 1,
                    "page_number": 1,
                    "student_answer": "x = 7",
                    "correct_answer": "x = 7",
                    "is_correct": True,
                    "error_pattern_slug": None,
                    "error_description": None,
                    "solution_steps": None,
                },
                {
                    "problem_number": 2,
                    "page_number": 1,
                    "student_answer": "x = 5",
                    "correct_answer": "x = 7",
                    "is_correct": False,
                    "error_pattern_slug": pattern_slug,
                    "error_description": "Sign error during distribution.",
                    "solution_steps": "1. -2(x-4)=6\n2. -2x+8=6\n3. -2x=-2\n4. x=1",
                },
                {
                    "problem_number": 3,
                    "page_number": 2,
                    "student_answer": "y = 3",
                    "correct_answer": "y = 3",
                    "is_correct": True,
                    "error_pattern_slug": None,
                    "error_description": None,
                    "solution_steps": None,
                },
            ],
        }
    )


async def test_diagnose_persists_diagnosis_and_observations(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    org, user, asmt = await _seed_assessment_with_pages(async_session)
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=_engine_response_three_problems(pattern.slug),
        tokens_input=1234,
        tokens_output=567,
        model="claude-sonnet-4-6",
    )

    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id,
            user=user,
            db=async_session,
        )

    # Diagnosis row exists.
    diag_rows = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalars().all()
    assert len(diag_rows) == 1
    diag = diag_rows[0]
    assert diag.model == "claude-sonnet-4-6"
    assert diag.tokens_input == 1234
    assert diag.tokens_output == 567
    assert diag.cost_usd > Decimal("0")
    assert diag.organization_id == org.id
    assert diag.overall_summary == "2 of 3 correct."

    # Observations: 3 rows in problem_number order.
    obs_rows = (
        await async_session.execute(
            select(ProblemObservation)
            .where(ProblemObservation.diagnosis_id == diag.id)
            .order_by(ProblemObservation.problem_number)
        )
    ).scalars().all()
    assert [o.problem_number for o in obs_rows] == [1, 2, 3]
    assert obs_rows[0].is_correct is True
    assert obs_rows[1].is_correct is False
    assert obs_rows[1].error_pattern_id == pattern.id
    assert obs_rows[1].solution_steps is not None
    assert obs_rows[2].is_correct is True

    # Assessment status moved to completed.
    await async_session.refresh(asmt)
    assert asmt.status == AssessmentStatus.completed


async def test_diagnose_resolves_pattern_slug(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=_engine_response_three_problems(pattern.slug),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )
    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    wrong_obs = (
        await async_session.execute(
            select(ProblemObservation).where(
                ProblemObservation.is_correct.is_(False)
            )
        )
    ).scalars().all()
    assert len(wrong_obs) == 1
    assert wrong_obs[0].error_pattern_id == pattern.id


async def test_diagnose_handles_unknown_slug(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)

    fake_response = ClaudeVisionResponse(
        text=_engine_response_three_problems("made-up-slug-not-in-taxonomy"),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )
    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    wrong_obs = (
        await async_session.execute(
            select(ProblemObservation).where(
                ProblemObservation.is_correct.is_(False)
            )
        )
    ).scalars().all()
    assert len(wrong_obs) == 1
    assert wrong_obs[0].error_pattern_id is None
    assert wrong_obs[0].error_description == "Sign error during distribution."
    assert wrong_obs[0].solution_steps is not None


async def test_diagnose_marks_failed_on_claude_error(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)

    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(side_effect=ClaudeServiceError("simulated 503")),
    ):
        with pytest.raises(ClaudeServiceError):
            await engine_service.diagnose_assessment(
                assessment_id=asmt.id, user=user, db=async_session,
            )

    await async_session.refresh(asmt)
    assert asmt.status == AssessmentStatus.failed
    diag_rows = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalars().all()
    assert len(diag_rows) == 0


async def test_diagnose_marks_failed_on_malformed_json(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)

    fake_response = ClaudeVisionResponse(
        text="this is not json",
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )
    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        with pytest.raises(engine_service.EngineParseError):
            await engine_service.diagnose_assessment(
                assessment_id=asmt.id, user=user, db=async_session,
            )

    await async_session.refresh(asmt)
    assert asmt.status == AssessmentStatus.failed


async def test_diagnose_404_when_missing(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Test",
        last_name="Teacher",
        organization_id=org.id,
    )
    async_session.add(user)
    await async_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await engine_service.diagnose_assessment(
            assessment_id=uuid4(),  # nonexistent
            user=user,
            db=async_session,
        )
    assert exc_info.value.status_code == 404


async def test_diagnose_403_cross_org(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    _, _, asmt = await _seed_assessment_with_pages(async_session)
    other_org = Organization(name="Other Org")
    async_session.add(other_org)
    await async_session.flush()
    other_user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Other",
        last_name="User",
        organization_id=other_org.id,
    )
    async_session.add(other_user)
    await async_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id,
            user=other_user,
            db=async_session,
        )
    assert exc_info.value.status_code == 403


async def test_diagnose_409_when_already_diagnosed(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(
        async_session, status=AssessmentStatus.completed
    )

    with pytest.raises(HTTPException) as exc_info:
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )
    assert exc_info.value.status_code == 409
```

- [ ] **Step 3: Run tests, verify failure**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/services/test_engine_service.py -v
```

Expected: 8 tests FAIL with `ImportError: cannot import name 'engine_service'`.

- [ ] **Step 4: Implement `engine_service`**

Create `apps/api/src/grade_sight_api/services/engine_service.py`:

```python
"""Diagnostic engine — runs Claude Sonnet 4.6 vision against an assessment.

Public entrypoint:
    diagnose_assessment(assessment_id, user, db) -> AssessmentDiagnosis

Pipeline:
1. Load Assessment + AssessmentPages, verify org + status.
2. Build the system prompt from the v1 taxonomy (cached on Anthropic side).
3. Generate presigned R2 GET URLs for each page.
4. Move Assessment.status to processing.
5. Call claude_service.call_vision_multi.
6. Parse the JSON response.
7. Resolve error_pattern slugs to UUIDs (NULL on unknown slug).
8. Persist diagnosis + observations in one tx.
9. Move Assessment.status to completed.

Failure paths set Assessment.status to failed before raising.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.assessment import Assessment, AssessmentStatus
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.assessment_page import AssessmentPage
from ..models.error_category import ErrorCategory
from ..models.error_pattern import ErrorPattern
from ..models.error_subcategory import ErrorSubcategory
from ..models.problem_observation import ProblemObservation
from ..models.user import User
from . import claude_service, storage_service
from .call_context import CallContext
from .claude_service import ClaudeServiceError

logger = logging.getLogger(__name__)


PROMPT_VERSION = "v1"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096


class EngineParseError(Exception):
    """Raised when Claude's response cannot be parsed as the expected JSON shape."""


class _EngineProblem(BaseModel):
    problem_number: int
    page_number: int
    student_answer: str
    correct_answer: str
    is_correct: bool
    error_pattern_slug: str | None = None
    error_description: str | None = None
    solution_steps: str | None = None


class _EngineOutput(BaseModel):
    overall_summary: str | None = None
    problems: list[_EngineProblem]


def _strip_markdown_fences(text: str) -> str:
    """Strip ```json ... ``` if Claude wrapped the response despite our instruction."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


async def _build_system_prompt(db: AsyncSession) -> str:
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

    lines.extend([
        "INSTRUCTIONS:",
        "For each problem you find on the pages:",
        "1. Identify the problem statement and the student's complete work and final answer.",
        "2. Solve the problem yourself to determine the correct answer.",
        "3. Compare. If the student's answer is wrong:",
        "   a. Pick the best-matching error_pattern_slug from the taxonomy.",
        "   b. Write a one-sentence error description.",
        "   c. Provide a clear step-by-step solution.",
        "",
        "OUTPUT FORMAT (return JSON only, no surrounding text):",
        "{",
        '  "overall_summary": "string | null (1-2 sentences highest-level takeaway)",',
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


async def _resolve_pattern_slug_to_id(
    db: AsyncSession, slug: str
) -> UUID | None:
    result = await db.execute(
        select(ErrorPattern.id).where(
            ErrorPattern.slug == slug,
            ErrorPattern.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def diagnose_assessment(
    *,
    assessment_id: UUID,
    user: User,
    db: AsyncSession,
) -> AssessmentDiagnosis:
    # 1. Load assessment + verify ownership + status.
    asmt_result = await db.execute(
        select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.deleted_at.is_(None),
        )
    )
    assessment = asmt_result.scalar_one_or_none()
    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="assessment not found",
        )
    if assessment.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="assessment does not belong to your organization",
        )
    if assessment.status != AssessmentStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"assessment status is {assessment.status.value}; cannot diagnose",
        )

    # 2. Load pages.
    pages_result = await db.execute(
        select(AssessmentPage)
        .where(
            AssessmentPage.assessment_id == assessment.id,
            AssessmentPage.deleted_at.is_(None),
        )
        .order_by(AssessmentPage.page_number)
    )
    pages = pages_result.scalars().all()
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="assessment has no pages",
        )

    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    # 3. Build prompt + presigned URLs.
    system_prompt = await _build_system_prompt(db)

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
    diagnosis = AssessmentDiagnosis(
        assessment_id=assessment.id,
        organization_id=user.organization_id,
        model=MODEL,
        prompt_version=PROMPT_VERSION,
        tokens_input=response.tokens_input,
        tokens_output=response.tokens_output,
        cost_usd=cost,
        latency_ms=latency_ms,
        overall_summary=engine_output.overall_summary,
    )
    db.add(diagnosis)
    await db.flush()

    for problem in engine_output.problems:
        error_pattern_id: UUID | None = None
        if not problem.is_correct and problem.error_pattern_slug:
            error_pattern_id = await _resolve_pattern_slug_to_id(
                db, problem.error_pattern_slug
            )
        observation = ProblemObservation(
            diagnosis_id=diagnosis.id,
            organization_id=user.organization_id,
            problem_number=problem.problem_number,
            page_number=problem.page_number,
            student_answer=problem.student_answer,
            correct_answer=problem.correct_answer,
            is_correct=problem.is_correct,
            error_pattern_id=error_pattern_id,
            error_description=problem.error_description,
            solution_steps=problem.solution_steps,
        )
        db.add(observation)

    await db.flush()

    # 9. Mark completed.
    assessment.status = AssessmentStatus.completed
    await db.flush()

    return diagnosis
```

- [ ] **Step 5: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/services/test_engine_service.py -v
```

Expected: 8 PASSED.

- [ ] **Step 6: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~71 passed, 2 skipped.

- [ ] **Step 7: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/services/engine_service.py apps/api/tests/conftest.py apps/api/tests/services/test_engine_service.py
git commit -m "$(cat <<'EOF'
Add engine_service.diagnose_assessment

Orchestrates the diagnostic engine: loads assessment + pages, builds
the prompt-cached system message from the live taxonomy, calls
claude_service.call_vision_multi with all N page URLs, parses the
returned JSON via Pydantic _EngineOutput, resolves error pattern
slugs to UUIDs (NULL when slug doesn't match), and persists one
AssessmentDiagnosis + N ProblemObservation rows in a single
transaction.

Status machine: pending → processing → completed/failed. Failure paths
(claude error, malformed JSON) all set status=failed before raising.
Markdown code fences (```json ... ```) are stripped before JSON
parse, in case Claude wraps the response despite our instruction.

PROMPT_VERSION='v1' stamped on every diagnosis row so future prompt
iterations can be bucketed.

Eight unit tests via patched call_vision_multi: happy path persists
3 observations, slug resolution, unknown-slug NULL, claude error =
failed, malformed JSON = failed, 404, 403, 409. New
seed_minimal_taxonomy fixture in conftest seeds 1 category +
1 subcategory + 1 pattern with known slugs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Endpoint + GET extension + 2 integration tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/schemas/assessments.py` (add response schemas)
- Modify: `apps/api/src/grade_sight_api/routers/assessments.py` (POST /api/assessments/{id}/diagnose; extend GET detail)
- Modify: `apps/api/tests/routers/test_assessments_router.py` (add 2 tests)

- [ ] **Step 1: Add Pydantic response schemas**

In `apps/api/src/grade_sight_api/schemas/assessments.py`, add these classes (preserve existing schemas):

```python
class ProblemObservationResponse(BaseModel):
    id: UUID
    problem_number: int
    page_number: int
    student_answer: str
    correct_answer: str
    is_correct: bool
    error_pattern_slug: str | None
    error_pattern_name: str | None
    error_category_slug: str | None
    error_description: str | None
    solution_steps: str | None


class AssessmentDiagnosisResponse(BaseModel):
    id: UUID
    model: str
    overall_summary: str | None
    cost_usd: float
    latency_ms: int
    created_at: datetime
    problems: list[ProblemObservationResponse]
```

Then update the existing `AssessmentDetailResponse` to include the optional diagnosis:

```python
class AssessmentDetailResponse(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    status: AssessmentStatus
    uploaded_at: datetime
    pages: list[AssessmentDetailPage]
    diagnosis: AssessmentDiagnosisResponse | None  # NEW
```

- [ ] **Step 2: Add the POST endpoint and extend GET detail**

In `apps/api/src/grade_sight_api/routers/assessments.py`, add:

1. New imports near the top (alphabetical with existing):

```python
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.error_category import ErrorCategory
from ..models.error_subcategory import ErrorSubcategory
from ..models.problem_observation import ProblemObservation
from ..schemas.assessments import (
    AssessmentDiagnosisResponse,
    ProblemObservationResponse,
    # ... keep existing imports
)
from ..services import engine_service
```

2. New helper function (place after `_safe_extension` or near the top of the file):

```python
async def _build_diagnosis_response(
    db: AsyncSession, diagnosis_id: UUID
) -> AssessmentDiagnosisResponse:
    """Load a diagnosis with its observations and joined error_pattern + category info.

    Returns the API response shape with slugs/names denormalized for the frontend.
    """
    diag_result = await db.execute(
        select(AssessmentDiagnosis).where(
            AssessmentDiagnosis.id == diagnosis_id,
            AssessmentDiagnosis.deleted_at.is_(None),
        )
    )
    diagnosis = diag_result.scalar_one()

    obs_result = await db.execute(
        select(
            ProblemObservation,
            ErrorPattern.slug.label("pattern_slug"),
            ErrorPattern.name.label("pattern_name"),
            ErrorCategory.slug.label("category_slug"),
        )
        .join(
            ErrorPattern,
            ProblemObservation.error_pattern_id == ErrorPattern.id,
            isouter=True,
        )
        .join(
            ErrorSubcategory,
            ErrorPattern.subcategory_id == ErrorSubcategory.id,
            isouter=True,
        )
        .join(
            ErrorCategory,
            ErrorSubcategory.category_id == ErrorCategory.id,
            isouter=True,
        )
        .where(
            ProblemObservation.diagnosis_id == diagnosis.id,
            ProblemObservation.deleted_at.is_(None),
        )
        .order_by(ProblemObservation.problem_number)
    )

    problems: list[ProblemObservationResponse] = []
    for obs, pattern_slug, pattern_name, category_slug in obs_result.all():
        problems.append(
            ProblemObservationResponse(
                id=obs.id,
                problem_number=obs.problem_number,
                page_number=obs.page_number,
                student_answer=obs.student_answer,
                correct_answer=obs.correct_answer,
                is_correct=obs.is_correct,
                error_pattern_slug=pattern_slug,
                error_pattern_name=pattern_name,
                error_category_slug=category_slug,
                error_description=obs.error_description,
                solution_steps=obs.solution_steps,
            )
        )

    return AssessmentDiagnosisResponse(
        id=diagnosis.id,
        model=diagnosis.model,
        overall_summary=diagnosis.overall_summary,
        cost_usd=float(diagnosis.cost_usd),
        latency_ms=diagnosis.latency_ms,
        created_at=diagnosis.created_at,
        problems=problems,
    )
```

(Note: `ErrorPattern` should already be imported from prior endpoints' pattern-resolution; if not, add `from ..models.error_pattern import ErrorPattern` near the other model imports.)

3. New endpoint at the bottom of the file:

```python
@router.post(
    "/api/assessments/{assessment_id}/diagnose",
    response_model=AssessmentDiagnosisResponse,
    status_code=status.HTTP_200_OK,
)
async def diagnose_assessment_endpoint(
    assessment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentDiagnosisResponse:
    """Run the diagnostic engine against an assessment. Sync ~30s wait.

    Returns the full diagnosis + observations on success. Status codes:
    - 200 OK on success
    - 403 if cross-org
    - 404 if assessment not found
    - 409 if already diagnosed (status != pending)
    - 500 on engine failure
    """
    diagnosis = await engine_service.diagnose_assessment(
        assessment_id=assessment_id, user=user, db=db,
    )
    return await _build_diagnosis_response(db, diagnosis.id)
```

4. Extend the existing `get_assessment_detail` to include the diagnosis. Find the section that builds `AssessmentDetailResponse` and add a `diagnosis` field. Replace the final `return AssessmentDetailResponse(...)` block with:

```python
    diagnosis_payload: AssessmentDiagnosisResponse | None = None
    diag_result = await db.execute(
        select(AssessmentDiagnosis.id).where(
            AssessmentDiagnosis.assessment_id == assessment.id,
            AssessmentDiagnosis.deleted_at.is_(None),
        )
    )
    diagnosis_id = diag_result.scalar_one_or_none()
    if diagnosis_id is not None:
        diagnosis_payload = await _build_diagnosis_response(db, diagnosis_id)

    return AssessmentDetailResponse(
        id=assessment.id,
        student_id=assessment.student_id,
        student_name=student_name,
        status=assessment.status,
        uploaded_at=assessment.uploaded_at,
        pages=detail_pages,
        diagnosis=diagnosis_payload,
    )
```

- [ ] **Step 3: Add the 2 integration tests**

Append to `apps/api/tests/routers/test_assessments_router.py`:

```python
# ---- POST /api/assessments/{id}/diagnose ----


async def test_post_diagnose_endpoint(
    async_session: AsyncSession, seed_minimal_taxonomy: dict
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
    async_session: AsyncSession, seed_minimal_taxonomy: dict
) -> None:
    from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
    from grade_sight_api.models.problem_observation import ProblemObservation
    from decimal import Decimal

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
```

Add `import json` to the test file's imports if not already present.

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run pytest tests/routers/test_assessments_router.py::test_post_diagnose_endpoint tests/routers/test_assessments_router.py::test_detail_includes_diagnosis_when_completed -v
```

Expected: 2 PASSED.

- [ ] **Step 5: Lint + typecheck + full suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests
~/.local/bin/uv run pytest -q
```

All clean. Total: ~73 passed, 2 skipped.

- [ ] **Step 6: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/api/src/grade_sight_api/schemas/assessments.py apps/api/src/grade_sight_api/routers/assessments.py apps/api/tests/routers/test_assessments_router.py
git commit -m "$(cat <<'EOF'
Add POST /api/assessments/{id}/diagnose + extend GET detail

POST endpoint runs the engine synchronously (~30s) and returns the
full AssessmentDiagnosisResponse (id, model, summary, cost, latency,
created_at, problems[]). Per-problem rows include error_pattern_slug
+ error_pattern_name + error_category_slug joined from the taxonomy.

GET /api/assessments/{id} response gains an optional diagnosis field
(null when status != completed). The denormalized slugs/names mean
the frontend never has to query the taxonomy itself.

Two integration tests:
- POST: dependency-overrides + patched call_vision_multi return a
  known JSON; asserts 200 + correct shape + slug → name resolution.
- GET-with-diagnosis: pre-seeded completed assessment + diagnosis +
  observation; asserts the GET response embeds the diagnosis.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend types + actions + RunDiagnosticButton

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/actions.ts`
- Create: `apps/web/components/run-diagnostic-button.tsx`

- [ ] **Step 1: Update `lib/types.ts`**

Add these types at the bottom of `apps/web/lib/types.ts`:

```ts
export interface ProblemObservation {
  id: string;
  problem_number: number;
  page_number: number;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  error_pattern_slug: string | null;
  error_pattern_name: string | null;
  error_category_slug: string | null;
  error_description: string | null;
  solution_steps: string | null;
}

export interface AssessmentDiagnosis {
  id: string;
  model: string;
  overall_summary: string | null;
  cost_usd: number;
  latency_ms: number;
  created_at: string;
  problems: ProblemObservation[];
}
```

Then extend the existing `AssessmentDetail` interface — find it and add the new `diagnosis` field:

```ts
export interface AssessmentDetail {
  id: string;
  student_id: string;
  student_name: string;
  status: AssessmentStatus;
  uploaded_at: string;
  pages: AssessmentDetailPage[];
  diagnosis: AssessmentDiagnosis | null;  // NEW
}
```

- [ ] **Step 2: Add `runDiagnostic` server action to `lib/actions.ts`**

Open `apps/web/lib/actions.ts`. Add this new action (alongside the existing `deleteAssessment`):

```ts
export async function runDiagnostic(id: string): Promise<void> {
  const response = await callApi(`/api/assessments/${id}/diagnose`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`POST /api/assessments/${id}/diagnose failed: ${response.status}`);
  }
}
```

- [ ] **Step 3: Create the RunDiagnosticButton component**

Create `apps/web/components/run-diagnostic-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { runDiagnostic } from "@/lib/actions";

export interface RunDiagnosticButtonProps {
  id: string;
}

export function RunDiagnosticButton({ id }: RunDiagnosticButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      try {
        await runDiagnostic(id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Diagnostic failed");
      }
    });
  }

  return (
    <div>
      <Button
        type="button"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Diagnosing — about 30 seconds…" : "Run diagnostic"}
      </Button>
      {error && (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
    </div>
  );
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
git add apps/web/lib/types.ts apps/web/lib/actions.ts apps/web/components/run-diagnostic-button.tsx
git commit -m "$(cat <<'EOF'
Add diagnostic types + runDiagnostic action + RunDiagnosticButton

New types in lib/types.ts: ProblemObservation, AssessmentDiagnosis.
AssessmentDetail gains an optional diagnosis field for the upcoming
detail page integration in Task 6.

New server action runDiagnostic(id) in lib/actions.ts hits POST
/api/assessments/{id}/diagnose. Throws on non-OK; on success the
caller is responsible for router.refresh() to re-fetch.

RunDiagnosticButton client component wraps the button in
useTransition; label flips to "Diagnosing — about 30 seconds…"
during the call. Errors render inline below the button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: DiagnosisDisplay + detail page integration

**Files:**
- Create: `apps/web/components/diagnosis-display.tsx`
- Modify: `apps/web/app/assessments/[id]/page.tsx`

- [ ] **Step 1: Create `DiagnosisDisplay` (server component)**

Create `apps/web/components/diagnosis-display.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { SectionEyebrow } from "@/components/section-eyebrow";
import type { AssessmentDiagnosis, ProblemObservation } from "@/lib/types";

export interface DiagnosisDisplayProps {
  diagnosis: AssessmentDiagnosis;
}

export function DiagnosisDisplay({ diagnosis }: DiagnosisDisplayProps) {
  return (
    <div className="my-12">
      <SectionEyebrow>Diagnostic results</SectionEyebrow>
      {diagnosis.overall_summary && (
        <p className="mt-3 font-serif text-lg text-ink">
          {diagnosis.overall_summary}
        </p>
      )}
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
        Grade-Sight's analysis. Verify with your teacher if uncertain.
      </p>

      <ul className="mt-6 space-y-4">
        {diagnosis.problems.map((p) => (
          <ProblemCard key={p.id} problem={p} />
        ))}
      </ul>
    </div>
  );
}

function ProblemCard({ problem }: { problem: ProblemObservation }) {
  return (
    <li className="rounded-[var(--radius-sm)] border border-rule bg-paper p-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Problem {problem.problem_number} · Page {problem.page_number}
        </p>
        {problem.is_correct ? (
          <Badge
            variant="secondary"
            className="font-mono uppercase tracking-[0.12em]"
          >
            ✓ Correct
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-mark text-paper font-mono uppercase tracking-[0.12em]"
          >
            ✗ Wrong
          </Badge>
        )}
      </div>

      <div className="mt-3">
        <p className="text-sm text-ink-soft">Student's answer</p>
        <p
          className={`mt-1 text-base ${
            problem.is_correct ? "text-ink" : "text-ink line-through"
          }`}
        >
          {problem.student_answer}
        </p>
      </div>

      {!problem.is_correct && (
        <>
          <div className="mt-3">
            <p className="text-sm text-ink-soft">Correct answer</p>
            <p className="mt-1 text-base text-ink">{problem.correct_answer}</p>
          </div>

          {problem.error_pattern_name && (
            <div className="mt-4 flex flex-wrap items-center gap-x-2">
              <Badge
                variant="secondary"
                className="font-mono uppercase tracking-[0.12em]"
              >
                {problem.error_category_slug
                  ? `${problem.error_category_slug} · ${problem.error_pattern_name}`
                  : problem.error_pattern_name}
              </Badge>
            </div>
          )}

          {problem.error_description && (
            <p className="mt-3 text-base text-ink">
              {problem.error_description}
            </p>
          )}

          {problem.solution_steps && (
            <details className="mt-4">
              <summary className="cursor-pointer text-base text-accent hover:underline">
                Show step-by-step solution
              </summary>
              <pre className="mt-3 whitespace-pre-wrap rounded-[var(--radius-sm)] bg-paper-soft p-4 font-serif text-base text-ink">
                {problem.solution_steps}
              </pre>
            </details>
          )}
        </>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Update the detail page to render the diagnostic section**

Open `apps/web/app/assessments/[id]/page.tsx`. Add these imports near the existing imports:

```tsx
import { DiagnosisDisplay } from "@/components/diagnosis-display";
import { RunDiagnosticButton } from "@/components/run-diagnostic-button";
```

Find the body section between the eyebrow line and the `<ul className="space-y-6">` page list. Insert this block right before the page list (after the existing `</div>` that closes the metadata line):

```tsx
        {/* Diagnostic section */}
        {detail.status === "pending" && (
          <div className="my-12 rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-8 text-center">
            <SerifHeadline level="section" as="h2">
              Run diagnostic
            </SerifHeadline>
            <p className="mt-2 text-base text-ink-soft">
              Grade-Sight will analyze each problem on this assessment,
              identify error patterns, and provide step-by-step solutions.
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Takes about 30 seconds
            </p>
            <div className="mt-6 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        )}
        {detail.status === "processing" && (
          <div className="my-12 rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Analyzing — about 30 seconds…
            </p>
          </div>
        )}
        {detail.status === "completed" && detail.diagnosis && (
          <DiagnosisDisplay diagnosis={detail.diagnosis} />
        )}
        {detail.status === "failed" && (
          <div className="my-12 rounded-[var(--radius-sm)] border border-mark bg-paper-soft p-8 text-center">
            <p className="text-base text-mark">
              Something went wrong analyzing this assessment.
            </p>
            <div className="mt-4 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        )}
```

The `SerifHeadline` component is already imported at the top of the file. If `level="section"` isn't a supported variant, use `level="page"` or check the component for the right value. (Spec 9 used `level="page"` and `level="greeting"`; pick whichever exists; this is a small visual choice the implementer can adjust.)

- [ ] **Step 3: Lint + typecheck**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/web
pnpm lint && pnpm typecheck
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add apps/web/components/diagnosis-display.tsx apps/web/app/assessments/[id]/page.tsx
git commit -m "$(cat <<'EOF'
Add DiagnosisDisplay + integrate diagnostic section into detail page

DiagnosisDisplay (server component) renders the per-problem cards
above the page images: optional summary + 'Grade-Sight's analysis'
disclaimer, then a card per ProblemObservation. Correct rows show
just the student answer; wrong rows show student + correct answers,
the pattern badge (when matched), the error description, and an
expandable native <details> "Show step-by-step solution".

Detail page now branches on Assessment.status:
- pending → 'Run diagnostic' CTA card with RunDiagnosticButton
- processing → 'Analyzing — about 30 seconds…' panel
- completed → DiagnosisDisplay
- failed → error panel + Retry button

The diagnostic section sits above the existing page-image stack so
the engine results are the first thing users see when they return
to a completed assessment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual smoke test + CLAUDE.md gate updates

**Files:**
- Modify: `CLAUDE.md`

This task verifies the engine works end-to-end against real Claude (no mocks), strikes the lifted scope gates, and marks Spec 11 complete.

- [ ] **Step 1: Confirm the dev server is running**

If the dev server (`pnpm dev`) isn't running from prior smoke tests, start it. The api worker should hot-reload on the model + service changes. If you see import errors, restart `pnpm dev` cleanly.

- [ ] **Step 2: End-to-end smoke test**

In a browser at http://localhost:3000:

1. Sign in as a teacher.
2. Navigate to `/upload`. Pick a student. Drop a real graded math quiz (1-3 pages, image format). Click Upload. Wait for the redirect to `/assessments/<id>`.
3. On the detail page, confirm the "Run diagnostic" CTA card is visible above the page images.
4. Click "Run diagnostic". Confirm:
   - Button label changes to "Diagnosing — about 30 seconds…".
   - After ~20-40 seconds, the page re-renders with the diagnosis above the pages.
5. **Diagnosis verification:** confirm the diagnosis section shows:
   - Eyebrow "Diagnostic results".
   - Optional overall summary (Claude may or may not include one).
   - Disclaimer line "Grade-Sight's analysis. Verify with your teacher if uncertain."
   - One card per problem the engine found. Each card has: problem number + page, correct/wrong badge, student answer, and (for wrong) correct answer + pattern badge + description + expandable solution.
6. **Solution expansion:** click "Show step-by-step solution" on a wrong problem. Confirm the solution renders below.
7. **Click again:** click "Run diagnostic" — wait, it shouldn't be visible. Confirm the button is gone (status moved to `completed`). If you somehow trigger it via curl, the API returns 409.
8. **Refresh:** reload the page. Diagnosis is still there (it's persisted, not in-flight state).

If any step fails, capture errors (browser console + dev server logs) and report **DONE_WITH_CONCERNS**. Otherwise proceed.

- [ ] **Step 3: Verify the engine actually called Claude (DB check)**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api
~/.local/bin/uv run python -c "
import asyncio
from grade_sight_api.db import async_session_factory
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.audit_log import AuditLog
from sqlalchemy import select, func

async def check():
    async with async_session_factory() as s:
        diag_count = (await s.execute(select(func.count(AssessmentDiagnosis.id)))).scalar()
        obs_count = (await s.execute(select(func.count(ProblemObservation.id)))).scalar()
        llm_count = (await s.execute(select(func.count(LLMCallLog.id)).where(LLMCallLog.success.is_(True)))).scalar()
        audit_count = (await s.execute(select(func.count(AuditLog.id)).where(AuditLog.action.like('%vision_multi%')))).scalar()
        print(f'Diagnoses: {diag_count}')
        print(f'Observations: {obs_count}')
        print(f'Successful LLM calls: {llm_count}')
        print(f'Vision-multi audit log rows: {audit_count}')
        latest = (await s.execute(
            select(AssessmentDiagnosis).order_by(AssessmentDiagnosis.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        if latest:
            print(f'Latest diagnosis: model={latest.model}  cost_usd={latest.cost_usd}  tokens_in={latest.tokens_input}  tokens_out={latest.tokens_output}')

asyncio.run(check())
"
```

Expected: at least 1 diagnosis, ≥1 observation per problem the engine found, ≥1 successful LLM call, ≥1 audit log row. The latest diagnosis should show `cost_usd` > 0 and a real token count.

- [ ] **Step 4: Strike the lifted scope gates from CLAUDE.md**

Open `/Users/exexporerporer/Projects/Grade-Sight/CLAUDE.md`. Find the §5 "Do NOT yet (active scope gates)" block. Delete these two lines:

```
- Do not build diagnostic engine logic — taxonomy not finalized
- Do not wire up Claude API calls — service layer stubs only
```

Leave the remaining gates in place:
- "Do not build the assessment upload flow — schema only" (still keeps anything new in this area gated; though Specs 9-10 already shipped it, we keep the gate to remind ourselves that further upload-flow work needs review).
- "Do not build UI beyond basic layout, auth, and navigation" (keeps general UI scope tight).
- "Do not implement eval set infrastructure — comes after engine is wired" (this is now ready to lift — the engine is wired — but we'll lift it explicitly in the eval-set spec, not here).
- "Do not build batch upload, cohort pulse, admin dashboards, or LMS integrations — those are Phase 2+".

- [ ] **Step 5: Update CLAUDE.md phase line**

Find the line:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), 9 (assessment upload UI shell), and 10 (multi-page assessment upload) complete. Next: diagnostic engine spec.
```

Replace with:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), 9 (assessment upload UI shell), 10 (multi-page assessment upload), and 11 (diagnostic engine v1) complete. Next: answer key upload (Spec 12).
```

- [ ] **Step 6: Commit**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Mark Spec 11 (diagnostic engine v1) complete in CLAUDE.md

Spec 11 acceptance done end-to-end:
- assessment_diagnoses + problem_observations tables (1:1 + N).
- claude_service.call_vision_multi extension supporting N images +
  prompt caching on the system block.
- engine_service.diagnose_assessment orchestrating taxonomy load,
  prompt build, presigned R2 GETs, Claude vision call, JSON parse,
  slug → UUID resolution, transactional persist.
- POST /api/assessments/{id}/diagnose endpoint (sync ~30s wait).
- GET /api/assessments/{id} extended with optional diagnosis field.
- RunDiagnosticButton + DiagnosisDisplay components.
- Detail page status-machine: pending CTA → processing wait →
  completed display → failed retry.
- 11 backend unit + integration tests; manual smoke verified
  against real Claude API.

Strikes two lifted scope gates from §5: "Do not build diagnostic
engine logic" and "Do not wire up Claude API calls — service layer
stubs only". Both no longer apply.

Page-level edit (delete a page, add pages), partial-credit semantics,
auto-trigger on upload, Mathpix integration, and re-run diagnoses
remain deferred to follow-up specs. Spec 12 (answer key upload) is
next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wrap-up

After Task 7, the branch is ahead of `origin/main` by 7 commits (one per task — schema, claude_service, engine_service, endpoint, frontend types/actions/button, frontend display + page integration, smoke + CLAUDE.md).

```bash
git log --oneline origin/main..HEAD
```

Expected (newest first):
```
<sha> Mark Spec 11 (diagnostic engine v1) complete in CLAUDE.md
<sha> Add DiagnosisDisplay + integrate diagnostic section into detail page
<sha> Add diagnostic types + runDiagnostic action + RunDiagnosticButton
<sha> Add POST /api/assessments/{id}/diagnose + extend GET detail
<sha> Add engine_service.diagnose_assessment
<sha> Extend claude_service with call_vision_multi
<sha> Add assessment_diagnoses + problem_observations tables
```

Test status: ~73 backend tests passing, 2 skipped. Frontend lint + typecheck clean. Manual smoke verified against real Claude.

Push when ready:

```bash
git push origin main
```

## Out of scope for this plan (deferred)

- **Answer key upload** — Spec 12. Optional teacher input for accuracy boost.
- **Auto-trigger on upload** — background task / queue, status polling.
- **Re-run diagnoses** — versioned `assessment_diagnoses` rows for prompt-version comparison. Requires lifting v1's UNIQUE constraint.
- **Partial credit semantics** — `is_correct: bool` becomes `score: float` + `partial_credit_reason`. For "correct method but small arithmetic slip" cases.
- **Mathpix integration** — cost reduction + math-OCR accuracy boost.
- **Multi-call pipeline** — Sonnet for vision, Haiku for output formatting.
- **Per-page visual annotations** — overlay marks on the page images.
- **Cost rate limiting / spending caps** per teacher / org.
- **Confidence scores per observation.**
- **Eval set infrastructure** — separate spec; gate stays in CLAUDE.md until then.
- **Longitudinal student tracking views.**
- **Class/cohort-level summaries.**
- **Export / PDF download.**
- **Frontend Vitest harness** — chronically deferred.
