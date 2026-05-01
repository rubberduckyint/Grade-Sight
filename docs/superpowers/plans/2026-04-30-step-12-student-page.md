# Step 12 · Student Page (biography view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the longitudinal biography view at `/students/[id]` — backend `GET /api/students/{id}/biography` aggregates stats + pattern timeline + recent assessments + editorial sentence in one payload; frontend renders five new presentational components composed by a pure server-rendered page.

**Architecture:** Pure server-rendered route. Backend service encapsulates all aggregation + trend classification heuristics in pure functions for unit-testability. No client state. New components live under `apps/web/components/student/`.

**Tech Stack:** FastAPI + SQLAlchemy 2 + pydantic v2 (backend); Next.js 16 App Router + React 19 server components + Tailwind 4 (frontend). No new packages.

**Spec:** `docs/superpowers/specs/2026-04-30-step-12-student-page-design.md`

**Branch:** `step-12-student-page` (already created off `main`; spec already committed at `c94fd36`).

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `apps/api/src/grade_sight_api/schemas/biography.py` | new | Pydantic response shapes per spec §Schemas. |
| `apps/api/src/grade_sight_api/services/biography_service.py` | new | Pure helpers `bucket_problems_by_week`, `classify_trend`, `build_pattern_timeline`, `build_biography_sentence`. Orchestrator `build_biography(student_id, role, db, weeks)`. |
| `apps/api/src/grade_sight_api/routers/students.py` | modify | Add `GET /api/students/{student_id}/biography`. |
| `apps/api/tests/services/test_biography_service.py` | new | Exhaustive unit tests for the four pure helpers. |
| `apps/api/tests/routers/test_students_router.py` | modify | Add biography endpoint integration tests (200 + 404 cross-org + 404 cross-owner). |
| `apps/web/lib/types.ts` | modify | Add `StudentBiography` type family. |
| `apps/web/lib/api.ts` | modify | Add `fetchStudentBiography(id, weeks?)`. |
| `apps/web/app/students/[id]/page.tsx` | new | Server component. Auth gate + biography fetch + composition. |
| `apps/web/components/student/student-header.tsx` | new | Crumb + serif H1 + meta + action bar. |
| `apps/web/components/student/biography-sentence.tsx` | new | Editorial sentence card. |
| `apps/web/components/student/stats-strip.tsx` | new | 4-cell horizontal grid. |
| `apps/web/components/student/pattern-timeline.tsx` | new | Bordered card with header row + N pattern rows with dot grids. |
| `apps/web/components/student/recent-assessments-table.tsx` | new | Bordered card with header row + ≤10 data rows linking to `/assessments/{id}`. |

---

## Task 1: Pydantic schemas

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/biography.py`

- [ ] **Step 1: Create the schemas file**

```python
"""Pydantic schemas for the student biography endpoint."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class StudentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    full_name: str
    first_name: str
    grade_level: int | None
    added_at: datetime


class BiographyStats(BaseModel):
    assessments_count: int
    average_score_percent: float | None
    problems_reviewed: int
    problems_missed: int
    patterns_detected: int
    recurring_count: int


class WeekBucket(BaseModel):
    week_start: date
    label: str
    count: int


class PatternTimelineRow(BaseModel):
    slug: str
    name: str
    category_slug: str
    category_name: str
    weeks: list[WeekBucket]
    total_count: int
    trend: Literal["recurring", "fading", "new", "one_off"]


class RecentAssessmentRow(BaseModel):
    id: UUID
    name: str
    uploaded_at: datetime
    mode: Literal["auto_grade", "with_key", "already_graded"]
    answer_key_name: str | None
    score_right: int
    score_total: int
    primary_error_pattern_name: str | None
    primary_error_pattern_count: int


class BiographySentence(BaseModel):
    kind: Literal["structured", "fallback"]
    eyebrow: str
    lead: str | None = None
    accent: str | None = None
    coda: str | None = None
    text: str | None = None


class StudentBiographyResponse(BaseModel):
    student: StudentSummary
    stats: BiographyStats
    weeks: list[date]
    pattern_timeline: list[PatternTimelineRow]
    recent_assessments: list[RecentAssessmentRow]
    sentence: BiographySentence
```

- [ ] **Step 2: mypy**

```bash
cd apps/api && .venv/bin/mypy src/grade_sight_api/schemas/biography.py
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/biography.py
git commit -m "$(cat <<'EOF'
api: add pydantic schemas for student biography

Step 12 · student page. Response shape for the new
GET /api/students/{id}/biography endpoint: student summary +
stats + week-bucketed pattern timeline + recent-assessments rows
+ a structured BiographySentence (kind: structured | fallback).

No call sites yet — the service + router + tests land in
subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Service helpers — `bucket_problems_by_week` + `classify_trend` + tests

**Files:**
- Create (initial): `apps/api/src/grade_sight_api/services/biography_service.py`
- Create: `apps/api/tests/services/test_biography_service.py`

TDD: write tests first (with failing imports), implement helpers, run tests.

- [ ] **Step 1: Write the failing tests for `bucket_problems_by_week` + `classify_trend`**

Write `apps/api/tests/services/test_biography_service.py`:

```python
"""Tests for biography_service helpers."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from grade_sight_api.services.biography_service import (
    BucketedProblem,
    bucket_problems_by_week,
    classify_trend,
)


# ─── classify_trend ──────────────────────────────────────────────────

def test_classify_trend_one_off() -> None:
    assert classify_trend([0, 0, 0, 0, 0, 1]) == "one_off"
    assert classify_trend([1, 0, 0, 0, 0, 0]) == "one_off"


def test_classify_trend_new_first_appearance_in_recent_two_weeks() -> None:
    # First appearance in last 2 weeks, ≥2 occurrences
    assert classify_trend([0, 0, 0, 0, 1, 2]) == "new"


def test_classify_trend_recurring_when_three_or_more_weeks_and_last_nonzero() -> None:
    assert classify_trend([0, 1, 1, 1, 0, 1]) == "recurring"
    assert classify_trend([1, 0, 1, 0, 1, 1]) == "recurring"


def test_classify_trend_fading_when_early_only_and_recent_window_empty() -> None:
    assert classify_trend([2, 1, 1, 0, 0, 0]) == "fading"
    assert classify_trend([3, 0, 0, 0, 0, 0]) == "fading"


def test_classify_trend_new_wins_over_recurring_for_recent_first_appearance() -> None:
    # First appearance is in last 2 weeks; even if total ≥ 3, NEW wins
    counts = [0, 0, 0, 0, 2, 2]
    assert classify_trend(counts) == "new"


def test_classify_trend_short_window_one_off() -> None:
    # Student with only 2 weeks of history, 1 occurrence
    assert classify_trend([0, 1]) == "one_off"


def test_classify_trend_short_window_new() -> None:
    assert classify_trend([1, 1]) == "new"


# ─── bucket_problems_by_week ─────────────────────────────────────────

def _bp(slug: str, when: datetime) -> BucketedProblem:
    return BucketedProblem(slug=slug, uploaded_at=when, is_correct=False)


def test_bucket_empty_input_returns_empty_dict() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week([], anchor_monday=monday, window_weeks=6)
    assert out == {}


def test_bucket_single_pattern_in_one_week() -> None:
    monday = date(2026, 4, 27)
    when = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    out = bucket_problems_by_week(
        [_bp("foo", when), _bp("foo", when)],
        anchor_monday=monday,
        window_weeks=6,
    )
    # weeks are oldest-first; the latest week is index 5
    assert out["foo"] == [0, 0, 0, 0, 0, 2]


def test_bucket_problems_across_multiple_weeks() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [
            _bp("foo", datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)),  # current week
            _bp("foo", datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)),  # 1 week ago
            _bp("foo", datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc)),  # 4 weeks ago
        ],
        anchor_monday=monday,
        window_weeks=6,
    )
    # current Monday is Apr 27 (index 5); Apr 20 is index 4; Mar 30 is index 1
    assert out["foo"] == [0, 1, 0, 0, 1, 1]


def test_bucket_excludes_problems_before_window() -> None:
    monday = date(2026, 4, 27)
    # First Monday in window is Mar 23. A problem on Mar 16 falls before window.
    out = bucket_problems_by_week(
        [_bp("foo", datetime(2026, 3, 16, 10, 0, tzinfo=timezone.utc))],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out == {}


def test_bucket_excludes_correct_problems() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [BucketedProblem(slug="foo", uploaded_at=datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc), is_correct=True)],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out == {}


def test_bucket_excludes_null_slugs() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [BucketedProblem(slug=None, uploaded_at=datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc), is_correct=False)],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out == {}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/api && .venv/bin/pytest tests/services/test_biography_service.py -v
```

Expected: ImportError because the service doesn't exist yet.

- [ ] **Step 3: Create the service file with the two helpers**

Write `apps/api/src/grade_sight_api/services/biography_service.py`:

```python
"""Biography aggregation + trend classification helpers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal


Trend = Literal["recurring", "fading", "new", "one_off"]


@dataclass
class BucketedProblem:
    """Lightweight input shape for bucket_problems_by_week."""

    slug: str | None
    uploaded_at: datetime
    is_correct: bool


def bucket_problems_by_week(
    problems: list[BucketedProblem],
    *,
    anchor_monday: date,
    window_weeks: int,
) -> dict[str, list[int]]:
    """Bucket wrong, slug-bearing problems into N calendar-week buckets.

    `anchor_monday` is the most recent Monday at or before "now". The window
    runs from `anchor_monday - (window_weeks-1)*7 days` through `anchor_monday`,
    inclusive. Returns a dict mapping slug → list-of-counts (oldest-first,
    length == window_weeks).

    Correct problems and problems with null `slug` are excluded.
    Problems before the window's first Monday are excluded.
    """
    if window_weeks <= 0:
        return {}

    # Build the list of Mondays (oldest-first).
    mondays = [anchor_monday - timedelta(days=7 * (window_weeks - 1 - i)) for i in range(window_weeks)]
    first_monday = mondays[0]

    out: dict[str, list[int]] = {}
    for p in problems:
        if p.is_correct or not p.slug:
            continue
        # Compute which Monday this problem belongs to (the most recent Monday ≤ uploaded_at)
        ud = p.uploaded_at.date()
        days_since_monday = (ud.weekday())  # 0 == Monday
        problem_monday = ud - timedelta(days=days_since_monday)
        if problem_monday < first_monday:
            continue
        idx = (problem_monday - first_monday).days // 7
        if idx < 0 or idx >= window_weeks:
            continue
        bucket = out.setdefault(p.slug, [0] * window_weeks)
        bucket[idx] += 1

    return out


def classify_trend(week_counts: list[int]) -> Trend:
    """Classify a pattern's trend across N week buckets.

    Heuristics (per spec Q2b):
      - one_off: total occurrences == 1
      - new: first occurrence was in the last 2 weeks AND total >= 2
      - recurring: appears in >= 3 of the N weeks AND last week's count > 0
      - fading: appeared in early third of the window AND absent from last 2 weeks
      - default: recurring (something is happening; we don't have a tighter label)
    """
    n = len(week_counts)
    total = sum(week_counts)

    if total == 0:
        # Should not happen in practice (caller filters), but defensive.
        return "one_off"
    if total == 1:
        return "one_off"

    first_nonzero = next((i for i, c in enumerate(week_counts) if c > 0), -1)
    nonzero_weeks = sum(1 for c in week_counts if c > 0)
    recent_window = week_counts[-2:] if n >= 2 else week_counts

    # NEW wins over RECURRING when first appearance is in the last 2 weeks
    if first_nonzero >= max(0, n - 2) and total >= 2:
        return "new"

    # RECURRING: ≥3 of N weeks AND last week non-zero
    if nonzero_weeks >= 3 and week_counts[-1] > 0:
        return "recurring"

    # FADING: appeared in early third AND absent in last 2
    early_threshold = max(1, n // 3)
    if first_nonzero != -1 and first_nonzero < early_threshold and all(c == 0 for c in recent_window):
        return "fading"

    return "recurring"
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && .venv/bin/pytest tests/services/test_biography_service.py -v
```

Expected: 13 tests pass.

- [ ] **Step 5: mypy**

```bash
cd apps/api && .venv/bin/mypy src/
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/biography_service.py \
        apps/api/tests/services/test_biography_service.py
git commit -m "$(cat <<'EOF'
api: add bucket_problems_by_week + classify_trend (biography_service)

Step 12 · student page. Pure helpers covering the time-bucketing
+ trend-classification heuristics from spec §2b. classify_trend
implements the 4 trend chips (recurring / fading / new / one_off)
with NEW winning ties over RECURRING when the first appearance is
within the last two weeks (per locked Q2b). bucket_problems_by_week
walks calendar-Monday boundaries and excludes correct problems +
null-slug problems + problems before the window.

13 pytest cases cover all four classify_trend branches +
short-window edge cases + bucket inclusion/exclusion rules.

build_pattern_timeline + build_biography_sentence + the orchestrator
land in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Service helpers — `build_pattern_timeline` + `build_biography_sentence` + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/biography_service.py`
- Modify: `apps/api/tests/services/test_biography_service.py`

- [ ] **Step 1: Append the failing tests**

Append to `apps/api/tests/services/test_biography_service.py`:

```python
from datetime import date as _date  # (add to imports if not already)

from grade_sight_api.schemas.biography import (
    BiographySentence,
    PatternTimelineRow,
    WeekBucket,
)
from grade_sight_api.services.biography_service import (
    PatternMeta,
    build_biography_sentence,
    build_pattern_timeline,
)


# ─── build_pattern_timeline ──────────────────────────────────────────

def test_build_pattern_timeline_orders_by_total_descending() -> None:
    monday = _date(2026, 4, 27)
    weeks = [monday - timedelta(days=7 * (5 - i)) for i in range(6)]
    bucketed = {
        "small": [0, 0, 0, 0, 0, 1],
        "big": [0, 1, 1, 1, 0, 1],
    }
    pattern_meta = {
        "small": PatternMeta(slug="small", name="Small", category_slug="execution", category_name="Execution"),
        "big": PatternMeta(slug="big", name="Big", category_slug="conceptual", category_name="Conceptual"),
    }
    rows = build_pattern_timeline(bucketed, pattern_meta, weeks)
    assert [r.slug for r in rows] == ["big", "small"]
    assert rows[0].total_count == 4
    assert rows[1].total_count == 1
    assert rows[0].trend == "recurring"
    assert rows[1].trend == "one_off"


def test_build_pattern_timeline_omits_unknown_pattern_meta() -> None:
    """If a slug appears in bucketed but not pattern_meta, skip it."""
    monday = _date(2026, 4, 27)
    weeks = [monday - timedelta(days=7 * (5 - i)) for i in range(6)]
    bucketed = {"unknown-slug": [0, 0, 0, 0, 0, 1]}
    rows = build_pattern_timeline(bucketed, {}, weeks)
    assert rows == []


# ─── build_biography_sentence ────────────────────────────────────────

def _row(slug: str, name: str, total: int, trend: str) -> PatternTimelineRow:
    return PatternTimelineRow(
        slug=slug,
        name=name,
        category_slug="execution",
        category_name="Execution",
        weeks=[],
        total_count=total,
        trend=trend,  # type: ignore[arg-type]
    )


def test_sentence_empty_timeline_no_assessments() -> None:
    s = build_biography_sentence([], "parent", "Marcus", n_assessments=0)
    assert s.kind == "fallback"
    assert "No assessments yet" in (s.text or "")


def test_sentence_empty_timeline_with_assessments() -> None:
    s = build_biography_sentence([], "parent", "Marcus", n_assessments=5)
    assert s.kind == "fallback"
    assert "clean" in (s.text or "").lower()
    assert "Marcus" in (s.text or "")


def test_sentence_recurring_parent_includes_coda() -> None:
    s = build_biography_sentence(
        [_row("neg-distrib", "Drops the negative when distributing", 7, "recurring")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert "WHAT WE'RE SEEING IN MARCUS" in s.eyebrow
    assert s.lead and "keeps coming back" in s.lead.lower()
    assert s.accent and "7 occurrences" in s.accent
    assert s.coda and "five-minute" in s.coda


def test_sentence_recurring_teacher_no_coda() -> None:
    s = build_biography_sentence(
        [_row("neg-distrib", "Drops the negative", 8, "recurring")],
        "teacher",
        "David",
        n_assessments=3,
    )
    assert s.kind == "structured"
    assert "WHY DAVID IS ON YOUR LIST" in s.eyebrow
    assert s.coda is None


def test_sentence_new_pattern() -> None:
    s = build_biography_sentence(
        [_row("sign", "Sign tracking", 3, "new")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert s.lead and "started showing up" in s.lead.lower()
    assert s.accent and "3 times" in s.accent


def test_sentence_fading() -> None:
    s = build_biography_sentence(
        [_row("frac", "Fraction conversion", 4, "fading")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert s.lead and "mostly clean" in s.lead.lower()


def test_sentence_one_off() -> None:
    s = build_biography_sentence(
        [_row("ord", "Order of operations", 1, "one_off")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert s.lead and "one miss" in s.lead.lower()
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && .venv/bin/pytest tests/services/test_biography_service.py -v
```

Expected: ImportError on `PatternMeta`, `build_pattern_timeline`, `build_biography_sentence`.

- [ ] **Step 3: Append helpers + dataclass to the service**

Append to `apps/api/src/grade_sight_api/services/biography_service.py`:

```python
from datetime import date as _date

from grade_sight_api.schemas.biography import (
    BiographySentence,
    PatternTimelineRow,
    WeekBucket,
)


@dataclass
class PatternMeta:
    """Meta about an error_pattern (slug + display info)."""

    slug: str
    name: str
    category_slug: str
    category_name: str


def _label_for_monday(d: _date) -> str:
    """Format a Monday date as a short month-day label, e.g. 'Mar 17'."""
    return d.strftime("%b %-d") if hasattr(d, "strftime") else d.isoformat()


def build_pattern_timeline(
    bucketed: dict[str, list[int]],
    pattern_meta: dict[str, PatternMeta],
    weeks: list[_date],
) -> list[PatternTimelineRow]:
    """Convert per-slug week counts into PatternTimelineRow objects.

    Sorted by total_count descending, ties broken by slug alphabetical.
    Slugs not present in `pattern_meta` are silently dropped (defensive).
    """
    rows: list[PatternTimelineRow] = []
    for slug, counts in bucketed.items():
        meta = pattern_meta.get(slug)
        if meta is None:
            continue
        total = sum(counts)
        if total == 0:
            continue
        week_buckets = [
            WeekBucket(
                week_start=monday,
                label=_label_for_monday(monday),
                count=counts[i] if i < len(counts) else 0,
            )
            for i, monday in enumerate(weeks)
        ]
        rows.append(
            PatternTimelineRow(
                slug=slug,
                name=meta.name,
                category_slug=meta.category_slug,
                category_name=meta.category_name,
                weeks=week_buckets,
                total_count=total,
                trend=classify_trend(counts),
            )
        )

    rows.sort(key=lambda r: (-r.total_count, r.slug))
    return rows


def build_biography_sentence(
    timeline: list[PatternTimelineRow],
    role: Literal["parent", "teacher"],
    first_name: str,
    *,
    n_assessments: int,
) -> BiographySentence:
    """Build the editorial sentence per spec §3a + §Service heuristics."""

    eyebrow = (
        f"WHY {first_name.upper()} IS ON YOUR LIST"
        if role == "teacher"
        else f"WHAT WE'RE SEEING IN {first_name.upper()} THIS MONTH"
    )

    if not timeline:
        text = (
            f"No assessments yet for {first_name}."
            if n_assessments == 0
            else f"{first_name} has been clean across the last {n_assessments} assessments."
        )
        return BiographySentence(kind="fallback", eyebrow=eyebrow, text=text)

    dominant = timeline[0]  # already sorted by total descending

    if dominant.trend == "recurring":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"One pattern keeps coming back: {dominant.name.lower()}.",
            accent=f"{dominant.total_count} occurrences in the last {n_assessments} assessments.",
            coda=("That's a five-minute conversation, not a tutor." if role == "parent" else None),
        )

    if dominant.trend == "new":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"{dominant.name} just started showing up.",
            accent=f"{dominant.total_count} times in the last 2 weeks.",
        )

    if dominant.trend == "fading":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"{first_name} is mostly clean. The misses don't repeat.",
        )

    # one_off
    return BiographySentence(
        kind="structured",
        eyebrow=eyebrow,
        lead=f"Only one miss worth flagging: {dominant.name.lower()}.",
    )
```

- [ ] **Step 4: Run tests + mypy**

```bash
cd apps/api && .venv/bin/pytest tests/services/test_biography_service.py -v
.venv/bin/mypy src/
```

Expected: 21 tests pass; mypy clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grade_sight_api/services/biography_service.py \
        apps/api/tests/services/test_biography_service.py
git commit -m "$(cat <<'EOF'
api: add build_pattern_timeline + build_biography_sentence

Step 12 · student page. PatternMeta dataclass + build_pattern_timeline
turns per-slug bucketed counts into PatternTimelineRow objects sorted
by total descending; build_biography_sentence consumes the sorted
timeline + role + first_name and produces a BiographySentence
(structured with parent-only coda for recurring; fallback for empty
timelines).

8 new pytest cases cover ordering, missing-meta exclusion, parent vs
teacher voicing, and each of the 4 trend dispatches in the sentence
(recurring / new / fading / one_off + 2 fallback paths).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Orchestrator — `build_biography(student_id, role, db, weeks)`

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/biography_service.py`

This task adds the orchestration that loads data + assembles the response. Pure-function tests cover the helpers; the orchestrator is exercised by Task 5's router integration tests.

- [ ] **Step 1: Append the orchestrator + score helper**

Append to `apps/api/src/grade_sight_api/services/biography_service.py`:

```python
from datetime import datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.student import Student
from grade_sight_api.schemas.biography import (
    BiographyStats,
    RecentAssessmentRow,
    StudentBiographyResponse,
    StudentSummary,
)
from grade_sight_api.services.diagnostic_review_service import (
    OverlayInputs,
    apply_reviews_to_problems,
)
from grade_sight_api.schemas.assessments import ProblemObservationResponse


def _first_name(full_name: str) -> str:
    trimmed = full_name.strip()
    if not trimmed:
        return full_name
    return trimmed.split()[0]


def _most_recent_monday(now: datetime | None = None) -> _date:
    n = (now or datetime.now(tz=timezone.utc)).date()
    return n - timedelta(days=n.weekday())


async def build_biography(
    *,
    student_id: UUID,
    role: Literal["parent", "teacher"],
    db: AsyncSession,
    window_weeks: int = 6,
) -> StudentBiographyResponse | None:
    """Aggregate student biography. Returns None if student doesn't exist.

    Caller is responsible for org/owner auth before invoking.
    """
    student = await db.scalar(
        select(Student).where(Student.id == student_id, Student.deleted_at.is_(None))
    )
    if student is None:
        return None

    anchor_monday = _most_recent_monday()
    weeks = [
        anchor_monday - timedelta(days=7 * (window_weeks - 1 - i))
        for i in range(window_weeks)
    ]

    # Load completed assessments for this student with diagnosis + problems
    asmts_result = await db.execute(
        select(Assessment)
        .where(
            Assessment.student_id == student_id,
            Assessment.deleted_at.is_(None),
            Assessment.status == AssessmentStatus.completed,
        )
        .order_by(Assessment.uploaded_at.desc())
        .options(
            selectinload(Assessment.diagnosis).selectinload(AssessmentDiagnosis.observations),
            selectinload(Assessment.answer_key),
        )
    )
    assessments = list(asmts_result.scalars())

    # Reviews + pattern index for overlay
    reviews_result = await db.execute(
        select(DiagnosticReview).where(
            DiagnosticReview.assessment_id.in_([a.id for a in assessments]) if assessments else False,
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    reviews_by_assessment: dict[UUID, list[DiagnosticReview]] = {}
    for r in reviews_result.scalars():
        reviews_by_assessment.setdefault(r.assessment_id, []).append(r)

    # Resolve override pattern names for any reviews that override
    override_pattern_ids = {
        r.override_pattern_id
        for rs in reviews_by_assessment.values()
        for r in rs
        if r.override_pattern_id is not None
    }
    if override_pattern_ids:
        op_result = await db.execute(
            select(ErrorPattern)
            .where(ErrorPattern.id.in_(override_pattern_ids))
            .options(selectinload(ErrorPattern.subcategory).selectinload(ErrorSubcategory.category))
        )
        override_pattern_index = {p.id: p for p in op_result.scalars()}
    else:
        override_pattern_index = {}

    # Bucket loop: collect (slug, uploaded_at, is_correct) tuples for the bucketing helper.
    bucketed_input: list[BucketedProblem] = []
    score_pairs: list[tuple[int, int]] = []  # (right, total) per assessment
    problems_reviewed = 0
    problems_missed = 0

    for asmt in assessments:
        if asmt.diagnosis is None:
            continue
        # Build ProblemObservationResponse rows (input for the overlay)
        raw = [
            ProblemObservationResponse(
                id=o.id,
                problem_number=o.problem_number,
                page_number=o.page_number,
                student_answer=o.student_answer,
                correct_answer=o.correct_answer,
                is_correct=o.is_correct,
                error_pattern_slug=o.error_pattern.slug if o.error_pattern else None,
                error_pattern_name=o.error_pattern.name if o.error_pattern else None,
                error_category_slug=(
                    o.error_pattern.subcategory.category.slug
                    if o.error_pattern and o.error_pattern.subcategory and o.error_pattern.subcategory.category
                    else None
                ),
                error_description=o.error_description,
                solution_steps=o.solution_steps,
                review=None,
            )
            for o in asmt.diagnosis.observations
        ]

        # Apply reviews using the same Step 11a overlay
        rows_for_asmt = reviews_by_assessment.get(asmt.id, [])

        class _Adapter:
            def __init__(self, row: DiagnosticReview, ix: dict[UUID, ErrorPattern]) -> None:
                self.id = row.id
                self.problem_number = row.problem_number
                self.marked_correct = row.marked_correct
                self.override_pattern_id = row.override_pattern_id
                self.note = row.note
                self.reviewed_at = row.reviewed_at
                self.reviewer_name = ""  # not used in biography overlay output

        class _PatternAdapter:
            def __init__(self, p: ErrorPattern) -> None:
                self.id = p.id
                self.slug = p.slug
                self.name = p.name
                self.category_slug = (
                    p.subcategory.category.slug
                    if p.subcategory and p.subcategory.category
                    else ""
                )
                self.category_name = (
                    p.subcategory.category.name
                    if p.subcategory and p.subcategory.category
                    else ""
                )

        adapters = [_Adapter(r, override_pattern_index) for r in rows_for_asmt]
        pattern_index_adapted = {pid: _PatternAdapter(p) for pid, p in override_pattern_index.items()}
        effective = apply_reviews_to_problems(
            OverlayInputs(problems=raw, reviews=adapters, pattern_index=pattern_index_adapted)  # type: ignore[arg-type]
        )

        # Score
        right = sum(1 for p in effective if p.is_correct)
        total = len(effective)
        score_pairs.append((right, total))
        problems_reviewed += total
        problems_missed += sum(1 for p in effective if not p.is_correct)

        # Bucket inputs (use effective slug + assessment.uploaded_at)
        for p in effective:
            bucketed_input.append(
                BucketedProblem(
                    slug=p.error_pattern_slug,
                    uploaded_at=asmt.uploaded_at,
                    is_correct=p.is_correct,
                )
            )

    bucketed = bucket_problems_by_week(
        bucketed_input, anchor_monday=anchor_monday, window_weeks=window_weeks
    )

    # Resolve display metadata for the slugs we actually saw
    seen_slugs = set(bucketed.keys())
    pattern_meta_index: dict[str, PatternMeta] = {}
    if seen_slugs:
        meta_result = await db.execute(
            select(ErrorPattern)
            .where(ErrorPattern.slug.in_(seen_slugs))
            .options(selectinload(ErrorPattern.subcategory).selectinload(ErrorSubcategory.category))
        )
        for p in meta_result.scalars():
            cat = p.subcategory.category if p.subcategory else None
            pattern_meta_index[p.slug] = PatternMeta(
                slug=p.slug,
                name=p.name,
                category_slug=cat.slug if cat else "",
                category_name=cat.name if cat else "",
            )

    timeline = build_pattern_timeline(bucketed, pattern_meta_index, weeks)

    # Stats
    avg_score = (
        sum(r / t for r, t in score_pairs if t > 0) / sum(1 for _, t in score_pairs if t > 0) * 100
        if score_pairs and any(t > 0 for _, t in score_pairs)
        else None
    )
    stats = BiographyStats(
        assessments_count=len(assessments),
        average_score_percent=round(avg_score, 1) if avg_score is not None else None,
        problems_reviewed=problems_reviewed,
        problems_missed=problems_missed,
        patterns_detected=len(timeline),
        recurring_count=sum(1 for r in timeline if r.trend == "recurring"),
    )

    # Recent assessments (top 10, with answer-key name + primary error)
    recent: list[RecentAssessmentRow] = []
    for asmt in assessments[:10]:
        right, total = (
            (sum(1 for o in asmt.diagnosis.observations if o.is_correct), len(asmt.diagnosis.observations))
            if asmt.diagnosis
            else (0, 0)
        )
        # Primary error pattern: most-frequent slug among wrong problems
        slug_counts: dict[str, int] = {}
        if asmt.diagnosis:
            for o in asmt.diagnosis.observations:
                if not o.is_correct and o.error_pattern and o.error_pattern.slug:
                    slug_counts[o.error_pattern.slug] = slug_counts.get(o.error_pattern.slug, 0) + 1
        primary_slug = max(slug_counts, key=lambda s: slug_counts[s]) if slug_counts else None
        primary_name = (
            pattern_meta_index[primary_slug].name
            if primary_slug and primary_slug in pattern_meta_index
            else None
        )
        primary_count = slug_counts.get(primary_slug, 0) if primary_slug else 0

        # Mode + answer key name
        if asmt.answer_key_id is not None:
            mode = "with_key"
            ak_name = asmt.answer_key.name if asmt.answer_key else None
        elif asmt.already_graded:
            mode = "already_graded"
            ak_name = None
        else:
            mode = "auto_grade"
            ak_name = None

        # Synthesized name (per spec §Naming for RecentAssessmentRow.name)
        if mode == "with_key" and ak_name:
            row_name = ak_name
        else:
            row_name = f"Assessment from {asmt.uploaded_at.strftime('%b %-d')}"

        recent.append(
            RecentAssessmentRow(
                id=asmt.id,
                name=row_name,
                uploaded_at=asmt.uploaded_at,
                mode=mode,  # type: ignore[arg-type]
                answer_key_name=ak_name,
                score_right=right,
                score_total=total,
                primary_error_pattern_name=primary_name,
                primary_error_pattern_count=primary_count,
            )
        )

    # Sentence
    first = _first_name(student.full_name)
    sentence = build_biography_sentence(
        timeline, role=role, first_name=first, n_assessments=len(assessments)
    )

    return StudentBiographyResponse(
        student=StudentSummary(
            id=student.id,
            full_name=student.full_name,
            first_name=first,
            grade_level=student.grade_level,
            added_at=student.created_at,
        ),
        stats=stats,
        weeks=weeks,
        pattern_timeline=timeline,
        recent_assessments=recent,
        sentence=sentence,
    )
```

The exact column names / relationships (`Student.created_at`, `ErrorPattern.subcategory.category.slug`, `Assessment.already_graded`) should be verified against the existing models — adjust if any differ.

- [ ] **Step 2: mypy**

```bash
cd apps/api && .venv/bin/mypy src/
```

Expected: clean. If mypy complains about the inline `_Adapter` / `_PatternAdapter` Protocols (matching the Step 11a pattern), apply the same `# type: ignore[arg-type]` on the `OverlayInputs(...)` call.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/grade_sight_api/services/biography_service.py
git commit -m "$(cat <<'EOF'
api: add build_biography orchestrator (eager-load + overlay + assemble)

Step 12 · student page. Top-level service function that:
  1. Loads the student's completed assessments + diagnoses + problems
  2. Loads active diagnostic_reviews + override patterns
  3. Applies the Step 11a apply_reviews_to_problems overlay so
     downstream aggregation sees effective state
  4. Buckets effective wrong problems into 6 calendar weeks
  5. Assembles BiographyStats + PatternTimelineRow[] + sentence +
     top-10 RecentAssessmentRow[]
  6. Returns StudentBiographyResponse | None

The router (Task 5) wraps this with auth gates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Router endpoint + integration tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/routers/students.py`
- Modify: `apps/api/tests/routers/test_students_router.py`

- [ ] **Step 1: Add the endpoint**

In `apps/api/src/grade_sight_api/routers/students.py`, find the existing `router = APIRouter(...)` line. Add at the bottom of the file:

```python
from typing import Literal
from grade_sight_api.services import biography_service
from grade_sight_api.schemas.biography import StudentBiographyResponse


@router.get(
    "/api/students/{student_id}/biography",
    response_model=StudentBiographyResponse,
)
async def get_student_biography(
    student_id: UUID,
    weeks: int = 6,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentBiographyResponse:
    """Return the longitudinal biography view for a student."""
    if weeks < 1 or weeks > 26:
        raise HTTPException(status_code=400, detail="weeks must be 1..26")

    # Load student to apply auth predicate before invoking the service
    student = await db.scalar(
        select(Student).where(Student.id == student_id, Student.deleted_at.is_(None))
    )
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")

    # Auth: parent owns OR teacher shares org
    if user.role == UserRole.parent:
        if student.created_by_user_id != user.id:
            raise HTTPException(status_code=404, detail="student not found")
        role: Literal["parent", "teacher"] = "parent"
    else:  # teacher / admin
        if student.organization_id is None or student.organization_id != user.organization_id:
            raise HTTPException(status_code=404, detail="student not found")
        role = "teacher"

    biography = await biography_service.build_biography(
        student_id=student_id, role=role, db=db, window_weeks=weeks
    )
    if biography is None:
        # Race: student deleted between auth check and service call
        raise HTTPException(status_code=404, detail="student not found")
    return biography
```

The `Student`, `User`, `UserRole`, `get_current_user`, `get_session`, `select`, `UUID`, `HTTPException`, `AsyncSession`, `Depends` imports should already be present in the file (the existing students router uses them). Add what's missing.

- [ ] **Step 2: Append router integration tests**

Append to `apps/api/tests/routers/test_students_router.py`:

```python
@pytest.mark.db
async def test_biography_returns_200_for_org_teacher(async_session: AsyncSession) -> None:
    """Happy path: teacher in org → 200 with the documented shape."""
    user = await _seed_user(async_session)  # teacher
    student = await _seed_student(async_session, user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{student.id}/biography")
            assert response.status_code == 200
            body = response.json()
            assert body["student"]["id"] == str(student.id)
            assert "stats" in body
            assert "pattern_timeline" in body
            assert "recent_assessments" in body
            assert "sentence" in body
            assert body["sentence"]["eyebrow"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_biography_returns_404_for_other_org_teacher(async_session: AsyncSession) -> None:
    """Teacher in a different org cannot access this student's biography."""
    org_a = Organization(name="A")
    org_b = Organization(name="B")
    async_session.add_all([org_a, org_b])
    await async_session.flush()

    student = Student(full_name="S", grade_level=8, organization_id=org_a.id)
    async_session.add(student)
    await async_session.flush()

    teacher_b = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@b.test",
        role=UserRole.teacher,
        first_name="B",
        last_name="Teach",
        organization_id=org_b.id,
    )
    async_session.add(teacher_b)
    await async_session.flush()

    app.dependency_overrides[get_current_user] = lambda: teacher_b
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{student.id}/biography")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_biography_returns_404_when_student_missing(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/students/{uuid4()}/biography")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()
```

The `_seed_user` and `_seed_student` helpers may need adjustment if they don't exist in this test file — copy/inline the patterns from `test_assessments_router.py`. The exact `Student.grade_level` field might be different — verify against the model if asserts fail.

- [ ] **Step 3: Run tests + mypy**

```bash
cd apps/api
.venv/bin/pytest tests/routers/test_students_router.py -v
.venv/bin/mypy src/
.venv/bin/pytest 2>&1 | tail -5
```

Expected: 3 new tests pass; existing tests still green; mypy clean; full suite passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/grade_sight_api/routers/students.py \
        apps/api/tests/routers/test_students_router.py
git commit -m "$(cat <<'EOF'
api: add GET /api/students/{id}/biography

Step 12 · student page. Wraps biography_service.build_biography
with auth gates (parent owns OR teacher shares org) + a weeks
query param (1..26 default 6). Three integration tests cover the
happy path, cross-org teacher 404, and missing-student 404.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend types + `fetchStudentBiography` helper

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Add types**

Append to `apps/web/lib/types.ts`:

```typescript
export interface StudentSummary {
  id: string;
  full_name: string;
  first_name: string;
  grade_level: number | null;
  added_at: string;
}

export interface BiographyStats {
  assessments_count: number;
  average_score_percent: number | null;
  problems_reviewed: number;
  problems_missed: number;
  patterns_detected: number;
  recurring_count: number;
}

export interface WeekBucket {
  week_start: string; // ISO date
  label: string;
  count: number;
}

export interface PatternTimelineRow {
  slug: string;
  name: string;
  category_slug: string;
  category_name: string;
  weeks: WeekBucket[];
  total_count: number;
  trend: "recurring" | "fading" | "new" | "one_off";
}

export interface RecentAssessmentRow {
  id: string;
  name: string;
  uploaded_at: string;
  mode: "auto_grade" | "with_key" | "already_graded";
  answer_key_name: string | null;
  score_right: number;
  score_total: number;
  primary_error_pattern_name: string | null;
  primary_error_pattern_count: number;
}

export interface BiographySentence {
  kind: "structured" | "fallback";
  eyebrow: string;
  lead: string | null;
  accent: string | null;
  coda: string | null;
  text: string | null;
}

export interface StudentBiography {
  student: StudentSummary;
  stats: BiographyStats;
  weeks: string[]; // ISO dates
  pattern_timeline: PatternTimelineRow[];
  recent_assessments: RecentAssessmentRow[];
  sentence: BiographySentence;
}
```

Add `StudentBiography` to whatever existing re-export block exists at the bottom of the file (mirror `AnswerKeyDetail` / `AssessmentDetail` etc.).

- [ ] **Step 2: Add the API helper**

Append to `apps/web/lib/api.ts` (mirror the `fetchAnswerKeyDetail` pattern from Step 11b):

```typescript
export async function fetchStudentBiography(
  id: string,
  weeks?: number,
): Promise<StudentBiography | null> {
  const qs = weeks ? `?weeks=${weeks}` : "";
  const response = await authedFetch(`/api/students/${id}/biography${qs}`, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET /api/students/${id}/biography failed: ${response.status}`);
  }
  return (await response.json()) as StudentBiography;
}
```

Add `StudentBiography` to the import block at the top of the file.

- [ ] **Step 3: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/api.ts
git commit -m "$(cat <<'EOF'
web: add StudentBiography type family + fetchStudentBiography

Step 12 · student page. Types match the new
GET /api/students/{id}/biography response shape. Helper mirrors
fetchAnswerKeyDetail (authedFetch, null on 404).

No call sites yet — Task 10 wires the page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `<StudentHeader>` + `<BiographySentence>` components

**Files:**
- Create: `apps/web/components/student/student-header.tsx`
- Create: `apps/web/components/student/biography-sentence.tsx`

- [ ] **Step 1: Create student-header.tsx**

```typescript
import Link from "next/link";

import { SerifHeadline } from "@/components/serif-headline";
import type { StudentSummary } from "@/lib/types";

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function StudentHeader({ student }: { student: StudentSummary }) {
  const grade = student.grade_level !== null ? `${student.grade_level}th grade · ` : "";
  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        <span>Students</span>
        <span aria-hidden="true"> · </span>
        <span className="text-ink">{student.full_name}</span>
      </p>

      <div className="mt-6 flex items-end justify-between gap-8">
        <div>
          <SerifHeadline level="page" as="h1">
            {student.full_name}
          </SerifHeadline>
          <p className="mt-3 font-sans text-base text-ink-soft">
            {grade}added {formatAbsoluteDate(student.added_at)}
          </p>
        </div>
        <Link
          href="/upload"
          className="font-mono text-xs uppercase tracking-[0.14em] text-accent hover:underline shrink-0"
        >
          Upload new quiz ›
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create biography-sentence.tsx**

```typescript
import type { BiographySentence as BiographySentenceShape } from "@/lib/types";

export function BiographySentence({ sentence }: { sentence: BiographySentenceShape }) {
  return (
    <section className="border border-rule-soft border-l-[3px] border-l-accent rounded-[var(--radius-md)] bg-paper-soft px-9 py-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        {sentence.eyebrow}
      </p>
      {sentence.kind === "structured" ? (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.35] tracking-[-0.012em] mt-4 max-w-[70ch]">
          {sentence.lead}
          {sentence.accent ? (
            <>
              {" "}
              <span className="text-ink-soft">{sentence.accent}</span>
            </>
          ) : null}
          {sentence.coda ? (
            <>
              {" "}
              <span className="text-accent">{sentence.coda}</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.35] tracking-[-0.012em] mt-4 max-w-[70ch]">
          {sentence.text}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/student/student-header.tsx \
        apps/web/components/student/biography-sentence.tsx
git commit -m "$(cat <<'EOF'
web: add student/student-header + student/biography-sentence

Step 12 · student page. StudentHeader: crumb + serif H1 + meta
line + Upload-new-quiz link. BiographySentence: boxed accent-blue
left-border treatment matching Step 10's TopSentence shape, with
optional accent body + parent-only coda phrase, and fallback text
for empty timelines.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `<StatsStrip>` + `<PatternTimeline>` components

**Files:**
- Create: `apps/web/components/student/stats-strip.tsx`
- Create: `apps/web/components/student/pattern-timeline.tsx`

- [ ] **Step 1: Create stats-strip.tsx**

```typescript
import type { BiographyStats } from "@/lib/types";

export function StatsStrip({ stats, weeksInWindow }: { stats: BiographyStats; weeksInWindow: number }) {
  const cells = [
    {
      eyebrow: "Assessments",
      headline: stats.assessments_count.toString(),
      sub: `in the last ${weeksInWindow} weeks`,
    },
    {
      eyebrow: "Avg score",
      headline: stats.average_score_percent !== null ? `${stats.average_score_percent}%` : "—",
      sub: stats.assessments_count
        ? `across ${stats.assessments_count} assessment${stats.assessments_count === 1 ? "" : "s"}`
        : "no assessments",
    },
    {
      eyebrow: "Problems reviewed",
      headline: stats.problems_reviewed.toString(),
      sub: `${stats.problems_missed} missed`,
    },
    {
      eyebrow: "Patterns detected",
      headline: stats.patterns_detected.toString(),
      sub: `${stats.recurring_count} recurring`,
    },
  ];

  return (
    <section
      aria-label="Stats"
      className="grid grid-cols-4 border border-rule rounded-[var(--radius-md)] bg-paper"
    >
      {cells.map((c, i) => (
        <div
          key={c.eyebrow}
          className={`px-6 py-5 ${i > 0 ? "border-l border-rule-soft" : ""}`}
        >
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            {c.eyebrow}
          </p>
          <p className="font-serif text-2xl text-ink mt-2">{c.headline}</p>
          <p className="font-sans text-sm text-ink-mute mt-1">{c.sub}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Create pattern-timeline.tsx**

```typescript
import type { PatternTimelineRow, WeekBucket } from "@/lib/types";

const TREND_COLORS: Record<PatternTimelineRow["trend"], { dot: string; chip: string }> = {
  recurring: { dot: "bg-accent", chip: "text-accent" },
  new: { dot: "bg-insight", chip: "text-insight" },
  fading: { dot: "bg-ink-mute", chip: "text-ink-mute" },
  one_off: { dot: "bg-ink-mute", chip: "text-ink-mute" },
};

const TREND_LABELS: Record<PatternTimelineRow["trend"], string> = {
  recurring: "Recurring",
  new: "New this week",
  fading: "Fading",
  one_off: "One-off",
};

function dotSizeClass(count: number): string {
  if (count === 0) return "w-1.5 h-1.5";
  if (count === 1) return "w-2.5 h-2.5";
  if (count === 2) return "w-4 h-4";
  return "w-5 h-5";
}

function dotColorClass(count: number, trend: PatternTimelineRow["trend"]): string {
  if (count === 0) return "bg-rule-soft";
  return TREND_COLORS[trend].dot;
}

export function PatternTimeline({
  rows,
  weeks,
}: {
  rows: PatternTimelineRow[];
  weeks: string[];
}) {
  if (rows.length === 0) {
    return (
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
          Patterns over time
        </p>
        <p className="mt-3 font-serif text-base text-ink-soft">
          No patterns yet — keep uploading quizzes and we'll start spotting recurring themes.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex justify-between items-baseline">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            Patterns over time · last {weeks.length} weeks
          </p>
          <p className="mt-2 font-serif text-2xl text-ink tracking-[-0.014em]">
            Where points have been going.
          </p>
        </div>
      </div>

      <div className="mt-5 border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[280px_1fr_70px_120px] gap-3 px-6 py-3 bg-paper-soft border-b border-rule-soft items-baseline">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Pattern</p>
          <div
            className="grid font-mono text-xs uppercase tracking-[0.06em] text-ink-mute text-center"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
          >
            {weeks.map((iso) => (
              <div key={iso}>
                {new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            ))}
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute text-right">Total</p>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Trend</p>
        </div>

        {/* Rows */}
        {rows.map((row) => (
          <div
            key={row.slug}
            className="grid grid-cols-[280px_1fr_70px_120px] gap-3 px-6 py-5 items-center border-t border-rule-soft first:border-t-0"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                {row.category_name}
              </p>
              <p className="font-serif text-lg text-ink mt-1 leading-tight">{row.name}</p>
            </div>
            <div
              className="grid items-center justify-items-center"
              style={{ gridTemplateColumns: `repeat(${row.weeks.length}, 1fr)` }}
              aria-label={`${row.name} weekly counts`}
            >
              {row.weeks.map((w: WeekBucket) => (
                <span
                  key={w.week_start}
                  className={`rounded-full ${dotSizeClass(w.count)} ${dotColorClass(w.count, row.trend)}`}
                  aria-label={`${w.label}: ${w.count}`}
                />
              ))}
            </div>
            <p className="font-serif text-lg text-ink text-right">
              {row.total_count}
              <span className="text-ink-mute text-sm">×</span>
            </p>
            <p
              className={`font-mono text-xs uppercase tracking-[0.12em] ${TREND_COLORS[row.trend].chip}`}
            >
              {TREND_LABELS[row.trend]}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/student/stats-strip.tsx \
        apps/web/components/student/pattern-timeline.tsx
git commit -m "$(cat <<'EOF'
web: add student/stats-strip + student/pattern-timeline

Step 12 · student page. StatsStrip: 4-cell horizontal grid with
mono eyebrow + serif headline number + sub. PatternTimeline: the
canvas's signature dot-grid table — rows = patterns, columns =
calendar weeks, dot size encodes count, dot color encodes trend,
plus total + trend chip per row. Empty state copy for students
with no patterns yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `<RecentAssessmentsTable>` component

**Files:**
- Create: `apps/web/components/student/recent-assessments-table.tsx`

- [ ] **Step 1: Create the component**

```typescript
import Link from "next/link";

import type { RecentAssessmentRow, Role } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentAssessmentsTable({
  assessments,
  role,
}: {
  assessments: RecentAssessmentRow[];
  role: Role;
}) {
  if (assessments.length === 0) {
    return (
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
          Recent assessments
        </p>
        <p className="mt-3 font-serif text-base text-ink-soft">No assessments yet.</p>
      </section>
    );
  }

  const showKeyColumn = role === "teacher";
  const cols = showKeyColumn
    ? "grid-cols-[80px_1.6fr_1fr_90px_1.6fr_28px]"
    : "grid-cols-[80px_2fr_90px_1.6fr_28px]";

  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Recent assessments · {assessments.length}
      </p>
      <div className="mt-3 border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden">
        <div className={`grid ${cols} gap-4 px-6 py-3 bg-paper-soft border-b border-rule-soft font-mono text-xs uppercase tracking-[0.12em] text-ink-mute`}>
          <div>Date</div>
          <div>Assessment</div>
          {showKeyColumn ? <div>Key</div> : null}
          <div>Score</div>
          <div>Primary error</div>
          <div></div>
        </div>
        {assessments.map((a) => (
          <Link
            key={a.id}
            href={`/assessments/${a.id}`}
            className={`grid ${cols} gap-4 px-6 py-4 items-center border-t border-rule-soft first:border-t-0 hover:bg-paper-soft focus-visible:outline-2 focus-visible:outline-accent`}
          >
            <p className="font-mono text-sm text-ink-mute">{formatDate(a.uploaded_at)}</p>
            <p className="font-serif text-lg text-ink">{a.name}</p>
            {showKeyColumn ? (
              <p className="font-sans text-sm text-ink-soft">
                {a.answer_key_name ?? "—"}
              </p>
            ) : null}
            <p className="font-serif text-lg text-ink">
              {a.score_total > 0 ? `${a.score_right}/${a.score_total}` : "—"}
            </p>
            <p className="font-sans text-base text-ink-soft">
              {a.primary_error_pattern_name
                ? `${a.primary_error_pattern_name} · ${a.primary_error_pattern_count}×`
                : "—"}
            </p>
            <span className="font-mono text-xs text-ink-mute text-right">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

`Role` is imported from `@/lib/types` if exposed there; otherwise `from "@/lib/diagnosis-sentence"` per the existing convention. Adjust to whichever is the existing source of truth.

- [ ] **Step 2: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/student/recent-assessments-table.tsx
git commit -m "$(cat <<'EOF'
web: add student/recent-assessments-table

Step 12 · student page. Bordered card with header row + ≤10 data
rows linking to /assessments/{id}. Teacher gets one extra column
for the answer-key name when with_key (parent role gets 4 columns).
Empty-state copy for students with no assessments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Page integration

**Files:**
- Create: `apps/web/app/students/[id]/page.tsx`

- [ ] **Step 1: Create the directory + page**

```bash
mkdir -p apps/web/app/students/\[id\]
```

Write `apps/web/app/students/[id]/page.tsx`:

```typescript
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { BiographySentence } from "@/components/student/biography-sentence";
import { PatternTimeline } from "@/components/student/pattern-timeline";
import { RecentAssessmentsTable } from "@/components/student/recent-assessments-table";
import { StatsStrip } from "@/components/student/stats-strip";
import { StudentHeader } from "@/components/student/student-header";
import { fetchMe, fetchStudentBiography } from "@/lib/api";
import type { Role } from "@/lib/diagnosis-sentence";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentBiographyPage({ params }: PageProps) {
  const { id } = await params;
  const [user, biography] = await Promise.all([
    fetchMe(),
    fetchStudentBiography(id),
  ]);

  if (!user) redirect("/sign-in");
  if (!biography) notFound();

  const role: Role = user.organization?.id ? "teacher" : "parent";

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer className="max-w-[1180px]">
        <div className="flex flex-col gap-12">
          <StudentHeader student={biography.student} />
          <BiographySentence sentence={biography.sentence} />
          <StatsStrip stats={biography.stats} weeksInWindow={biography.weeks.length} />
          <PatternTimeline rows={biography.pattern_timeline} weeks={biography.weeks} />
          <RecentAssessmentsTable assessments={biography.recent_assessments} role={role} />
        </div>
      </PageContainer>
    </AppShell>
  );
}
```

If `Role` isn't exported from `@/lib/diagnosis-sentence` for some reason, define it locally (`type Role = "parent" | "teacher"`) — match whatever Step 11a/11b's `<DiagnosisHeader>` uses.

- [ ] **Step 2: Verify the full gate**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: typecheck clean, lint 0 errors / 2 pre-existing warnings, all tests pass, build succeeds with `ƒ /students/[id]` as a dynamic route.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/students/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
web: add /students/[id] biography page

Step 12 · student page. Server component composing
StudentHeader + BiographySentence + StatsStrip + PatternTimeline +
RecentAssessmentsTable from a single fetchStudentBiography call.
Auth gate (no user → /sign-in) + biography gate (null → notFound)
inherit org-scoping from the API endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Restart dev servers if needed**

```bash
pnpm dev
```

- [ ] **Step 2: Navigate to a student with assessments**

From `/students`, click any existing student. URL should become `/students/{id}`. Verify the page renders with:
- Crumb `STUDENTS · {Student name}` at top.
- Big serif H1 = student name.
- Meta line `{N}th grade · added {Mon DD}`.
- "Upload new quiz ›" link top-right.
- Editorial sentence card with accent-blue left border. Eyebrow says either `WHAT WE'RE SEEING IN {NAME} THIS MONTH` (parent) or `WHY {NAME} IS ON YOUR LIST` (teacher).
- 4-stat strip with assessments count + avg score + problems reviewed + patterns detected.
- Pattern timeline (or empty-state copy if no patterns).
- Recent assessments table linking to each assessment.

- [ ] **Step 3: Verify navigation back to assessments**

Click any row in the recent assessments table → lands on `/assessments/{id}` (existing Step 10 page).

- [ ] **Step 4: Verify role differences**

If you have access to both a parent and a teacher account, sign in as each and verify:
- Parent sentence eyebrow: `WHAT WE'RE SEEING IN {NAME} THIS MONTH`
- Teacher sentence eyebrow: `WHY {NAME} IS ON YOUR LIST`
- Recent assessments table — teacher sees an extra "Key" column

- [ ] **Step 5: Verify cross-org / cross-owner 404**

Direct URL access to a student that doesn't belong to your account or org → 404.

- [ ] **Step 6: Note any deviations**

Screenshot anything that looks wrong to `assets/screenshots/step-12-{scenario}.png`. This task does not produce a commit unless deviations require fixes.

---

## Task 12: gh pr create + merge after user OK

**Files:** none.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..HEAD
```

Expected: spec commit (`c94fd36`) + 10 task commits.

- [ ] **Step 2: Push the latest**

```bash
git push
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --title "Step 12 · Student page (biography view)" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

New server-rendered route `/students/[id]` — the longitudinal biography view. Backend `GET /api/students/{id}/biography` aggregates stats + pattern timeline + recent assessments + editorial sentence in one payload. Frontend renders five new presentational components.

## Why

Step 12 of the v2 design build. The diagnosis page covers a single assessment; the student page is the page parents and teachers come back to weekly to see how a student is trending across many. The pattern timeline is the canvas's signature move — categorical recurrence, not a percentage line.

## What changed

- **Backend.** New `services/biography_service.py` with pure helpers (`bucket_problems_by_week`, `classify_trend`, `build_pattern_timeline`, `build_biography_sentence`) + orchestrator (`build_biography`). New `schemas/biography.py`. New endpoint `GET /api/students/{id}/biography` with parent-owns / teacher-shares-org auth. Re-uses Step 11a's `apply_reviews_to_problems` overlay so all aggregation sees effective post-review state.
- **Frontend.** New components under `apps/web/components/student/`: `<StudentHeader>`, `<BiographySentence>`, `<StatsStrip>`, `<PatternTimeline>`, `<RecentAssessmentsTable>`. New page at `apps/web/app/students/[id]/page.tsx`. New `fetchStudentBiography` helper. Pure server-rendered; no client state.

## Tokens used

`text-ink` / `text-ink-soft` / `text-ink-mute` / `text-accent` / `text-insight` for chrome and trend indicators. `bg-paper` / `bg-paper-soft` / `border-rule` / `border-rule-soft`. Mono caps eyebrows `text-xs` (13px) per established Step 09–11 allowance.

## Verification

`pnpm --filter api test` (143+ pytest, all green) · `pnpm --filter api typecheck` (mypy strict clean) · `pnpm --filter web test` (vitest, all green) · `pnpm --filter web typecheck` clean · `pnpm --filter web lint` (0 errors / 2 pre-existing warnings) · `pnpm --filter web build` clean (new route as `ƒ /students/[id]`).

Visual: parent role + teacher role, recurring pattern + new pattern + fading + empty-timeline. Recent-assessments rows link to existing `/assessments/{id}`. Cross-org / cross-owner direct URL → 404.

## Seven-item checklist

1. Every font size is a token — pass.
2. Every color is a token — pass.
3. Visible focus ring on every interactive element — pass.
4. Amber only at insight moments. Red only on `/error` ERR-XXX — pass (insight amber on `new` trend chip + dot).
5. Body 18px / nothing below 15px — pass; mono eyebrows `text-xs` (13px) per established allowance.
6. Serif = meaning, sans = doing — pass.
7. Matches reference canvas — partial pass. Five deliberate v1 departures called out in spec: no class-context rail, no suggested-intervention card, no mobile, no `12 of 27 flagged` subline, no `+4 vs Feb` deltas.

## Open questions / provisional decisions

- Class-context rail (teacher-only) deferred to the future class-roster step (followups.md).
- `+4 vs Feb` trend deltas deferred — requires historical anchor outside the 6-week window.
- Mobile responsive layout deferred to broader v2 mobile pass.
- `See full history →` filter link deferred — the assessments archive belongs to Step 13 (Operational Surfaces).
EOF
)"
```

- [ ] **Step 4: Wait for David's "merge" / "lgtm" / "ship it"**

Once authorized:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Plan task |
|---|---|
| Pydantic schemas | Task 1 |
| `bucket_problems_by_week` + `classify_trend` | Task 2 |
| `build_pattern_timeline` + `build_biography_sentence` | Task 3 |
| `build_biography` orchestrator (eager-load + overlay + assemble) | Task 4 |
| Router endpoint + auth gates + integration tests | Task 5 |
| Frontend types + `fetchStudentBiography` helper | Task 6 |
| `<StudentHeader>` + `<BiographySentence>` | Task 7 |
| `<StatsStrip>` + `<PatternTimeline>` | Task 8 |
| `<RecentAssessmentsTable>` | Task 9 |
| Page composition + auth gate | Task 10 |
| Manual visual verification | Task 11 |
| PR open + merge | Task 12 |

All requirements covered.

**2. Placeholder scan:** No "TBD", "TODO", "implement later", or "similar to Task N" patterns. The orchestrator (Task 4) has a few "verify against existing models" notes for column names — that's responsible adaptation guidance, not a placeholder. Each step has full code.

**3. Type consistency:**

- `StudentBiography` (TS) ↔ `StudentBiographyResponse` (Python) — fields match.
- `BiographySentence` (TS) ↔ `BiographySentence` (Python) — same shape.
- `Role` is referenced in Tasks 9, 10 — sourced from `@/lib/diagnosis-sentence` per Step 10's existing convention.
- `PatternMeta` (Python dataclass in Task 3) is consumed by `build_pattern_timeline` and built in `build_biography` (Task 4).
- `BucketedProblem` (Python dataclass in Task 2) is consumed by `bucket_problems_by_week` and built in `build_biography` (Task 4).
- `PatternTimelineRow.trend` literal union matches between TS and Python.
- All service helpers' return types align with their pydantic schema counterparts (Task 1 → consumed in Tasks 3 + 4).

All names and signatures consistent.
