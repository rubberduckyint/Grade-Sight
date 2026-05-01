# Step 12 · Student Page (biography view) — design

**Reference:** `docs/design/Grade Sight Handoff v2.html` §Implementation Step 12:
> STEP 12 · STUDENT PAGE · Build /students/[id] — the biography view.
> Longitudinal patterns, recent assessments, recurring themes, intervention links. Match Student Page canvas.

**Canvas:** `docs/design/Grade Sight Student Page.html` (rendered via `session3-student.jsx`).

**Branch:** `step-12-student-page` (off `main` post-Step-11b merge). **Mode:** v2 design step — branch + per-step PR opened/merged via `gh` CLI per established workflow.

## Why this exists as a step

The diagnosis page (Step 10) and the inline edit panel + viewer (Steps 11a/11b) cover a single assessment. The student page is the longitudinal surface — the page a parent or teacher comes back to weekly to see how a student is trending across many assessments. The canvas's signature move is the **pattern timeline**: each error pattern is a row, weeks are columns, dot size encodes severity, color encodes trend. It replaces a percentage-line chart that would have been the wrong shape for categorical recurrence data.

This is the highest-value unbuilt longitudinal surface in the v2 roadmap. It's also the natural home for several deferred items from earlier steps:
- The "recurring for student" callout deferred from Step 11a's diagnosis-page top sentence.
- The longitudinal aggregations that paywall trial stats want (followups.md `Paywall right-column trial stats — opportunistic`).
- The student-context anchor that future "send a parent note" / class-context features hang off.

## Discovery

- The handoff route map lists `/students/[id]` as a teacher + parent route.
- The current `/students` page (`apps/web/app/students/page.tsx`) is just the roster + add-student form. There is no `/students/[id]` route today; Step 12 builds it from scratch.
- The data we need is already there: `Student`, `Assessment`, `AssessmentDiagnosis`, `ProblemObservation`, `ErrorPattern`, `DiagnosticReview`. No schema changes.
- Class-aware data (class context rail, "12 of 27 flagged this month") requires `classes` and `class_members` to be wired — `/api/classes` doesn't exist (per `followups.md`). Defer the class-context portion of the canvas; it lands when the class-roster step runs.
- The diagnostic-review overlay from Step 11a is the source of truth for effective state. The biography page consumes effective state by re-using `apply_reviews_to_problems` server-side.

## Scope

- **In:** Server-rendered route `/students/[id]`. New backend endpoint `GET /api/students/{id}/biography` returning aggregated stats + pattern timeline + recent assessments + editorial sentence in one payload. Five new presentational components under `apps/web/components/student/`. Pattern timeline with trend chips. Editorial sentence with parent vs teacher voicing. 4-stat strip both roles. Recent assessments table.
- **Out:** Class context rail (teacher only), `12 of 27 flagged` subline, suggested-intervention card with print-handout link, `+4 vs Feb` trend deltas, mobile responsive layout, hover/click interactivity on timeline dots, `Edit student` action, `Send parent note` action, `Mark resolved` action, `See full history →` filter link.

## Architecture

The page is a pure server component composing five presentational sub-components. No `"use client"`, no client state, no hydration boundary. Single round trip to the backend's `GET /api/students/{id}/biography` returns the fully aggregated payload — server-side trend classification + week bucketing + sentence construction. Mirrors the Step 11a pattern of moving derived state to the API layer.

The student-page family lives under `apps/web/components/student/` (siblings to `apps/web/components/diagnosis/`). No shared components between the families.

## Components

| Path | Type | Responsibility |
|---|---|---|
| **Backend** | | |
| `apps/api/src/grade_sight_api/schemas/biography.py` | new (~80 lines) | `StudentBiographyResponse`, `BiographyStats`, `PatternTimelineRow`, `WeekBucket`, `RecentAssessmentRow`, `BiographySentence` (discriminated union: `structured` / `fallback`). |
| `apps/api/src/grade_sight_api/services/biography_service.py` | new (~250 lines) | Pure aggregation + heuristic helpers: `bucket_problems_by_week(...)`, `classify_trend(...)`, `build_pattern_timeline(...)`, `build_biography_sentence(...)`. Orchestrator `build_biography(student_id, role, db)` returns the full response. |
| `apps/api/src/grade_sight_api/routers/students.py` | modify | Add `GET /api/students/{student_id}/biography` endpoint. Auth: parent-owns OR teacher-shares-org. Optional query parameter `weeks` (default 6, max 26). |
| `apps/api/tests/services/test_biography_service.py` | new (~250 lines) | Exhaustive coverage of bucketing + each trend classification + sentence construction. |
| `apps/api/tests/routers/test_students_router.py` | modify | Add biography endpoint test: 200 happy path, 404 cross-org, 404 cross-owner, 401 no auth. |
| **Frontend** | | |
| `apps/web/lib/types.ts` | modify | Add `StudentBiography` family of types matching the response shape. |
| `apps/web/lib/api.ts` | modify | Add `fetchStudentBiography(id, weeks?)` helper using existing `authedFetch` pattern. |
| `apps/web/app/students/[id]/page.tsx` | new (~110 lines) | Server component. Auth gate (`!user → /sign-in`); biography gate (`!biography → notFound()`); composes the family. Role derived from `user.organization?.id`. |
| `apps/web/components/student/student-header.tsx` | new (~70 lines) | Crumb (`STUDENTS · {NAME}`) + `<SerifHeadline level="page">` H1 = student full name + meta line (grade + added date) + action bar (Edit + Upload-new-quiz Link). |
| `apps/web/components/student/biography-sentence.tsx` | new (~60 lines) | Renders `BiographySentence`. Boxed: `border border-rule-soft border-l-[3px] border-l-accent rounded-md bg-paper-soft px-9 py-8`. Mono accent eyebrow + serif body + optional accent-coda phrase. |
| `apps/web/components/student/stats-strip.tsx` | new (~50 lines) | 4-cell horizontal grid: each cell = mono eyebrow + serif headline + sub line. Uniform shape. |
| `apps/web/components/student/pattern-timeline.tsx` | new (~120 lines) | Bordered card with header row + N rows. Each row: category eyebrow + serif name; horizontal dot grid (size = count, color by trend); total count; trend chip. |
| `apps/web/components/student/recent-assessments-table.tsx` | new (~80 lines) | Bordered card with header row + ≤10 data rows. Each row links to `/assessments/{id}`. Teacher gets one extra column for answer-key name when `with_key`. |

## Schemas

```python
# apps/api/src/grade_sight_api/schemas/biography.py
from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class StudentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    full_name: str
    first_name: str  # derived: split on whitespace, take [0]
    grade_level: int | None
    added_at: datetime  # student.created_at


class BiographyStats(BaseModel):
    assessments_count: int
    average_score_percent: float | None  # None if no assessments
    problems_reviewed: int  # total problems in window across all assessments
    problems_missed: int    # effective wrong count
    patterns_detected: int  # distinct error_pattern_slug count
    recurring_count: int    # patterns classified as "recurring"

# (week count is derivable from len(StudentBiographyResponse.weeks))


class WeekBucket(BaseModel):
    week_start: date  # Monday of the calendar week
    label: str        # short display label e.g. "Mar 17"
    count: int        # occurrences of this pattern in this week


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
    name: str  # synthesized: "{student_name}'s assessment from {date}" — see §Naming
    uploaded_at: datetime
    mode: Literal["auto_grade", "with_key", "already_graded"]
    answer_key_name: str | None  # only when mode == "with_key"
    score_right: int
    score_total: int
    primary_error_pattern_name: str | None
    primary_error_pattern_count: int  # 0 when none


class BiographySentence(BaseModel):
    kind: Literal["structured", "fallback"]
    eyebrow: str  # role-aware mono-caps text
    lead: str | None  # primary serif clause (None for fallback uses `text` instead)
    accent: str | None  # secondary clause rendered in text-ink-soft
    coda: str | None    # parent-only editorial phrase in text-accent
    text: str | None    # fallback text when kind="fallback"


class StudentBiographyResponse(BaseModel):
    student: StudentSummary
    stats: BiographyStats
    weeks: list[date]  # week_start dates of all displayed buckets, in chronological order
    pattern_timeline: list[PatternTimelineRow]
    recent_assessments: list[RecentAssessmentRow]
    sentence: BiographySentence
```

## Service heuristics

### `bucket_problems_by_week`

Given a list of `(uploaded_at, problem)` pairs and a window length in weeks:

1. Compute the most recent calendar Monday at or before `now()` UTC. This is the "current Monday."
2. Generate `window_weeks` Mondays going back from current (inclusive). The list goes oldest-first.
3. For each problem, compute its bucket: the most recent Monday `<=` problem's `uploaded_at`. Skip problems that fall before the window's earliest Monday.
4. Return `dict[str, list[int]]` mapping `error_pattern_slug` → list-of-counts (one per Monday, oldest-first).

For students with < `window_weeks` of history, the returned list still has `window_weeks` entries (zeros for weeks before the first assessment); the response payload trims `weeks_in_window` to the actual active range so the frontend can label appropriately.

### `classify_trend(week_counts)`

```python
def classify_trend(week_counts: list[int]) -> Literal["recurring", "fading", "new", "one_off"]:
    n = len(week_counts)
    total = sum(week_counts)

    if total == 1:
        return "one_off"

    first_nonzero = next((i for i, c in enumerate(week_counts) if c > 0), -1)
    nonzero_weeks = sum(1 for c in week_counts if c > 0)
    recent_window = week_counts[-2:] if n >= 2 else week_counts

    # NEW wins over RECURRING when first appearance is in last 2 weeks AND
    # there is no earlier history.
    if first_nonzero >= max(0, n - 2) and total >= 2:
        return "new"

    # RECURRING: appears in >=3 of the (up to) N weeks AND last week non-zero.
    if nonzero_weeks >= 3 and week_counts[-1] > 0:
        return "recurring"

    # FADING: appeared in early third of the window AND absent from last 2.
    if first_nonzero != -1 and first_nonzero <= max(1, n // 3) and all(c == 0 for c in recent_window):
        return "fading"

    # Fallback default — recurring (something is happening; we just don't have a tighter label).
    return "recurring"
```

For students with `n < 6`, the heuristics scale: `n // 3` etc. shrink with `n`. Edge case: `n == 1` and `total == 1` → `one_off`. `n == 2` and `total >= 2` → `new` if both occurrences are in the recent_window, else `recurring`.

### `build_biography_sentence(timeline, role, first_name, n_assessments)`

```python
def build_biography_sentence(
    timeline: list[PatternTimelineRow],
    role: Literal["parent", "teacher"],
    first_name: str,
    n_assessments: int,
) -> BiographySentence:
    eyebrow = (
        f"WHY {first_name.upper()} IS ON YOUR LIST"
        if role == "teacher"
        else f"WHAT WE'RE SEEING IN {first_name.upper()} THIS MONTH"
    )

    if not timeline:
        return BiographySentence(
            kind="fallback",
            eyebrow=eyebrow,
            lead=None, accent=None, coda=None,
            text=f"{first_name} has been clean across the last {n_assessments} assessments." if n_assessments else f"No assessments yet for {first_name}.",
        )

    # Dominant pattern: highest total_count, tie-break by first occurrence (oldest first).
    dominant = max(timeline, key=lambda r: (r.total_count, -r.weeks[0].week_start.toordinal()))

    if dominant.trend == "recurring":
        return BiographySentence(
            kind="structured", eyebrow=eyebrow,
            lead=f"One pattern keeps coming back: {dominant.name.lower()}.",
            accent=f"{dominant.total_count} occurrences in the last {n_assessments} assessments.",
            coda=("That's a five-minute conversation, not a tutor." if role == "parent" else None),
            text=None,
        )

    if dominant.trend == "new":
        return BiographySentence(
            kind="structured", eyebrow=eyebrow,
            lead=f"{dominant.name} just started showing up.",
            accent=f"{dominant.total_count} times in the last 2 weeks.",
            coda=None, text=None,
        )

    if dominant.trend == "fading":
        return BiographySentence(
            kind="structured", eyebrow=eyebrow,
            lead=f"{first_name} is mostly clean. The misses don't repeat.",
            accent=None, coda=None, text=None,
        )

    # one_off
    return BiographySentence(
        kind="structured", eyebrow=eyebrow,
        lead=f"Only one miss worth flagging: {dominant.name.lower()}.",
        accent=None, coda=None, text=None,
    )
```

## Data flow

```
fetchMe() → user
fetchStudentBiography(id, weeks=6) → StudentBiographyResponse | null
                                    ↓
page.tsx server component
  ├─ Auth gate: !user → redirect("/sign-in")
  ├─ Biography gate: !biography → notFound()  (also covers cross-org via API auth)
  └─ Render:
       <AppShell>
         <PageContainer max-w-[1180px]>
           <StudentHeader student={biography.student} role={role} />
           <BiographySentence sentence={biography.sentence} role={role} firstName={biography.student.first_name} />
           <StatsStrip stats={biography.stats} />
           <PatternTimeline rows={biography.pattern_timeline} weeks={biography.weeks} />
           <RecentAssessmentsTable assessments={biography.recent_assessments} role={role} />
         </PageContainer>
       </AppShell>
```

## Auth

| Gate | Trigger | Response |
|---|---|---|
| Auth | `!user` | redirect `/sign-in` |
| Biography | `!biography` (API returns 404) | `notFound()` |

Backend predicate (in `routers/students.py`):

```python
if user.role == UserRole.parent and student.created_by_user_id != user.id:
    raise HTTPException(404, "student not found")
if user.role == UserRole.teacher:
    if student.organization_id is None or student.organization_id != user.organization_id:
        raise HTTPException(404, "student not found")
```

Always 404 (not 403) to avoid information disclosure.

## Naming for `RecentAssessmentRow.name`

Today's `Assessment` model has no `name` or `title` field. The diagnosis page (Step 10) renders the student's name as the H1. For the recent-assessments table, we synthesize a per-row name:

- If `mode == "with_key"` → `f"{answer_key_name}"` (e.g., "Quiz 9.1 key" — the answer-key name doubles as the quiz identifier)
- Otherwise → `f"Assessment from {abs date}"` (e.g., "Assessment from Apr 28")

This is honest with current data and consistent with Step 10's stance ("we don't have an assessment title field; that's a future schema change").

## Image / asset loading

None. The student page is pure typography + tabular data. No `<img>` tags except the existing app shell logo.

## Error handling

- Network failure on `fetchStudentBiography` → throws → Next's `error.tsx` renders.
- Empty `pattern_timeline[]` → sentence renders fallback; timeline section renders empty-state copy ("No patterns yet — `{first_name}` is doing fine.")
- Empty `recent_assessments[]` → "No assessments yet" message in the table card.
- Student exists but has zero completed assessments → all sections render with empty/fallback content.

## Accessibility

- Each pattern timeline row's dot-grid uses both size and color to encode count + trend. Color-only is forbidden (handoff rule); size variation provides a redundant cue. Trend chip text is the authoritative classifier.
- `<RecentAssessmentsTable>` rows are real `<a>` links; native `:focus-visible` ring; keyboard navigation works without overrides.
- Stats-strip cells are non-interactive; the headline number is decorative — eyebrow text carries the meaning.
- `<SerifHeadline level="page">` H1 is the page heading; eyebrows are mono caps `<p>`s.
- No animations.

## Testing

Backend (pytest):
- `tests/services/test_biography_service.py` — pure-function tests:
  - `bucket_problems_by_week`: empty list, single problem, problems across 6 weeks, problem on a Sunday boundary, problem before window start (excluded).
  - `classify_trend`: each label class (recurring / fading / new / one_off); edge `n=1` total=1 → one_off; `n=2` total=2 both recent → new; `n=6` recurring + new → new wins.
  - `build_pattern_timeline`: tie-break by first-occurrence; correct problems excluded; null-slug excluded (we don't show OTHER bucket on this surface — patterns must have a slug).
  - `build_biography_sentence`: dominant=recurring (parent + teacher), dominant=new, dominant=fading, dominant=one_off, empty timeline + n_assessments=0, empty timeline + n_assessments>0.
- `tests/routers/test_students_router.py` — extend with biography GET tests covering 200, 404 cross-org, 404 cross-owner.

Frontend:
- No new vitest target. Components are presentational compositions; visual verification is the cheaper signal (Step 11b precedent).
- `pnpm --filter web typecheck` clean.
- `pnpm --filter web lint` clean (0 errors / 2 pre-existing warnings).
- `pnpm --filter web build` succeeds with `ƒ /students/[id]` as a dynamic route.

Manual visual verification:
- Parent role × student with ≥ 4 completed assessments and a recurring pattern.
- Parent role × student with all-correct assessments (sentence falls back, timeline empty).
- Parent role × student with < 6 weeks of data.
- Teacher role × student in same org (eyebrow says `WHY {NAME} IS ON YOUR LIST`).
- Cross-org direct URL → 404.
- Cross-owner direct URL → 404.

## Verification checklist

- [ ] `GET /api/students/{id}/biography` returns the documented schema; auth-gated correctly.
- [ ] `bucket_problems_by_week`, `classify_trend`, `build_pattern_timeline`, `build_biography_sentence` all covered by pytest with explicit examples.
- [ ] `<StudentHeader>`, `<BiographySentence>`, `<StatsStrip>`, `<PatternTimeline>`, `<RecentAssessmentsTable>` exist under `apps/web/components/student/`.
- [ ] Pattern timeline renders dot-grid with size = count and color by trend.
- [ ] Stats strip shows the four exact stats from §Q3b.
- [ ] Sentence renders parent vs teacher eyebrow per Q3a.
- [ ] All four pnpm gates clean.
- [ ] Manual visual verification passes for the six scenarios.

## Out of scope (with assignment)

| Item | Owner |
|---|---|
| Class context rail (teacher-only) | future class-roster step (followups.md) |
| `12 of 27 students flagged this month` subline | same |
| Suggested intervention card with print handout link | Step 14 (Print Intervention) |
| `Send a parent note` action | future communication step |
| `Mark resolved` action | future state-tracking step |
| `+4 vs Feb` trend deltas on stats | requires historical anchor outside the 6-week window |
| Mobile responsive layout | broader v2 mobile pass |
| Hover/click interactivity on timeline dots | followup if v1 reads insufficient |
| `See full history →` link to filtered archive | Step 13 (Operational Surfaces) — the assessments archive |
| `Edit student` action button | already exists at `/students` add-form; reuse later |

## Seven-item checklist (handoff doc)

1. **Every font size is a token** — pass.
2. **Every color is a token** — pass.
3. **Visible focus ring on every interactive element** — pass.
4. **Amber only at insight moments. Red only on `/error` ERR-XXX** — pass. Insight amber on `new` trend chip + dot color. No red.
5. **Body text 18px / nothing below 15px** — pass for body; mono eyebrows `text-xs` (13px) per established allowance.
6. **Serif = meaning, sans = doing** — pass.
7. **Matches reference canvas** — partial pass. Five deliberate v1 departures called out in §Out of scope: no class-context rail, no intervention card, no mobile, no `12 of 27 flagged` subline, no `+4 vs Feb` deltas. The v1 ships the editorial centerpiece (timeline + sentence + stats) — the canvas's class-aware layer waits for class-roster data.

## Locked decisions

- **Q1 scope:** A — both roles, no class context, no intervention card, no mobile.
- **Q2a aggregation:** server-side via new `GET /api/students/{id}/biography`.
- **Q2b heuristics:** 6-week calendar-week buckets; trend per `classify_trend` (with `new` winning ties over `recurring`); patterns with < 6 weeks anchor at first assessment.
- **Q3a sentence:** role-aware mono eyebrow + serif body driven by dominant pattern's trend, parent-only accent-coda.
- **Q3b stats strip:** 4 stats both roles (drop the role-specific 5th teacher stat — `IN CLASS` requires class data).
- **Q3c recent assessments:** parent gets 4 columns + chevron; teacher gets one extra column for the answer-key name when `with_key`.
- **Approach:** Approach 1 — pure server-rendered route + new backend endpoint + presentational sub-components under `apps/web/components/student/`.
