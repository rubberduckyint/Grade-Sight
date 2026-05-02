# Step 13a · Archive + Answer-key library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/assessments` archive table and `/keys` answer-key library — both teacher-only — plus two cheap a11y fixes (skip-to-content link, focus-visible ring on tabs) that benefit every page in the app.

**Architecture:** Two existing FastAPI list endpoints get extended (`/api/assessments` adds date filter + cursor + `has_key` + per-row `headline_inputs`; `/api/answer-keys` adds per-row `usage` aggregation). Frontend reuses the Step 10 `buildTopSentence` helper as the single source of truth for the headline string. Two server-rendered Next.js pages compose small focused components. Existing `<AnswerKeyUploadForm>` is reused inside an `<AddKeyDialog>` modal — no new key-creation logic.

**Tech Stack:** Next.js 16 + React 19 server components + Tailwind 4 + shadcn `<Dialog>` + `<Select>`; FastAPI + SQLAlchemy 2 + pydantic v2; pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-05-01-step-13a-archive-keys-design.md`

**Branch:** `step-13a-archive-keys` (already created at `cb5de6b` with spec committed).

---

## Task 1 · Hoist nav to `lib/nav.ts` and apply tabs to `/students`

**Why first:** Smallest mechanical change. Lets us validate the tab pattern on existing pages (`/students`, `/students/[id]`) before adding two new ones. No tests — typecheck + manual visual.

**Files:**
- Create: `apps/web/lib/nav.ts`
- Modify: `apps/web/app/dashboard/page.tsx` (remove local consts, import from `lib/nav.ts`)
- Modify: `apps/web/app/students/page.tsx` (add tabs)
- Modify: `apps/web/app/students/[id]/page.tsx` (add tabs)

- [ ] **Step 1: Create `lib/nav.ts` with the two tab constants**

```ts
// apps/web/lib/nav.ts
import type { AppHeaderTab } from "@/components/app-header";

export const PARENT_TABS: AppHeaderTab[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Students", href: "/students" },
];

export const TEACHER_TABS: AppHeaderTab[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Students", href: "/students" },
  { label: "Assessments", href: "/assessments" },
  { label: "Answer keys", href: "/keys" },
];
```

- [ ] **Step 2: Update `dashboard/page.tsx` to import from `lib/nav.ts`**

Replace the local `PARENT_TABS` / `TEACHER_TABS` const declarations (currently at lines 24-34) with:

```ts
import { PARENT_TABS, TEACHER_TABS } from "@/lib/nav";
```

Remove the const blocks. The rest of the file is unchanged.

- [ ] **Step 3: Add tabs to `/students/page.tsx`**

Modify the existing `AppShell` invocation to include role-aware tabs. The page already does `fetchMe()` → `user`; add right after that:

```tsx
const role = user.role === "teacher" ? "teacher" : "parent";
const tabs = role === "teacher" ? TEACHER_TABS : PARENT_TABS;
```

Then in the `<AppShell>` props:

```tsx
<AppShell
  orgName={user.organization?.name}
  userId={user.id}
  organizationId={user.organization?.id ?? null}
  tabs={tabs}
  activeHref="/students"
  uploadHref="/upload"
>
```

Add the imports:

```ts
import { PARENT_TABS, TEACHER_TABS } from "@/lib/nav";
```

- [ ] **Step 4: Add tabs to `/students/[id]/page.tsx`**

Same pattern as Step 3. The page already fetches `user` via `fetchMe()`; compute `tabs` and pass `tabs={tabs} activeHref="/students" uploadHref="/upload"` to `<AppShell>`. (The active tab stays "Students" because `/students/[id]` is a sub-route of Students.)

- [ ] **Step 5: Run typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: PASS, no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/nav.ts apps/web/app/dashboard/page.tsx apps/web/app/students/page.tsx apps/web/app/students/[id]/page.tsx
git commit -m "web: hoist tab nav to lib/nav.ts and apply to /students*"
```

---

## Task 2 · A11y additions (skip-to-content link + focus-visible ring on tabs)

**Files:**
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/components/app-header.tsx`
- Test: `apps/web/components/app-shell.test.tsx`

- [ ] **Step 1: Write failing test for the skip-to-content link**

Create `apps/web/components/app-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders a skip-to-content link with href #main", () => {
    render(
      <AppShell userId="u-1" organizationId="o-1">
        <div>content</div>
      </AppShell>,
    );
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main");
  });

  it("wraps children in <main id='main'>", () => {
    render(
      <AppShell userId="u-1" organizationId="o-1">
        <div data-testid="child">content</div>
      </AppShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toContainElement(screen.getByTestId("child"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm test app-shell.test.tsx`
Expected: FAIL — neither the skip link nor the `id="main"` exist yet.

- [ ] **Step 3: Add skip-to-content link + `id="main"` to AppShell**

Edit `apps/web/components/app-shell.tsx`. Replace the body of the returned JSX with:

```tsx
return (
  <div className="flex min-h-screen flex-col bg-paper">
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-sm)] focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
    >
      Skip to main content
    </a>
    <SentryUserSync userId={userId} organizationId={organizationId} />
    <AppHeader
      orgName={orgName}
      tabs={tabs}
      activeHref={activeHref}
      uploadHref={uploadHref}
      uploadLabel={uploadLabel}
    />
    <main id="main" className="flex-1">{children}</main>
  </div>
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm test app-shell.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add focus-visible ring to AppHeader tab links**

Edit `apps/web/components/app-header.tsx`. Inside the `tabs.map`, modify the className for the `<Link>`:

```tsx
className={cn(
  "border-b-2 pb-3.5 text-base transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
  "focus-visible:rounded-[var(--radius-sm)]",
  active
    ? "border-ink font-medium text-ink"
    : "border-transparent font-normal text-ink-soft hover:text-ink",
)}
```

(The active/inactive ternary is the existing pattern; we only add the two `focus-visible:` lines.)

- [ ] **Step 6: Run typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/app-shell.tsx apps/web/components/app-shell.test.tsx apps/web/components/app-header.tsx
git commit -m "web: add skip-to-content link in AppShell and focus-visible ring on AppHeader tabs"
```

---

## Task 3 · Backend · `/api/answer-keys` usage extension

**Files:**
- Modify: `apps/api/src/grade_sight_api/schemas/answer_keys.py`
- Modify: `apps/api/src/grade_sight_api/routers/answer_keys.py`
- Test: `apps/api/tests/routers/test_answer_keys_router.py`

- [ ] **Step 1: Add `AnswerKeyUsage` schema + extend `AnswerKeySummary`**

Edit `apps/api/src/grade_sight_api/schemas/answer_keys.py`. Add the new model and extend the existing summary:

```python
class AnswerKeyUsage(BaseModel):
    used_count: int
    last_used_at: datetime | None


class AnswerKeySummary(BaseModel):
    id: UUID
    name: str
    page_count: int
    first_page_thumbnail_url: str
    created_at: datetime
    usage: AnswerKeyUsage  # NEW
```

- [ ] **Step 2: Write failing tests for the usage shape**

Edit `apps/api/tests/routers/test_answer_keys_router.py` and add new tests at the bottom:

```python
async def test_list_answer_keys_returns_zero_usage_for_unused_key(
    teacher_client, db, teacher_org, teacher_user
):
    # An answer key with no assessments referencing it
    key = AnswerKey(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        name="Unused Key",
    )
    db.add(key)
    await db.flush()
    db.add(AnswerKeyPage(answer_key_id=key.id, organization_id=teacher_org.id, page_number=1, original_filename="p1.png", s3_url="s3://k/p1.png"))
    await db.commit()

    resp = await teacher_client.get("/api/answer-keys")
    assert resp.status_code == 200
    keys = resp.json()["answer_keys"]
    assert len(keys) == 1
    assert keys[0]["usage"] == {"used_count": 0, "last_used_at": None}


async def test_list_answer_keys_returns_correct_usage_count_and_last_used(
    teacher_client, db, teacher_org, teacher_user
):
    # Create a key + two assessments referencing it (different uploaded_at)
    key = AnswerKey(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        name="Used Key",
    )
    student = Student(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        full_name="Test Student",
    )
    db.add_all([key, student])
    await db.flush()
    db.add(AnswerKeyPage(answer_key_id=key.id, organization_id=teacher_org.id, page_number=1, original_filename="p1.png", s3_url="s3://k/p1.png"))

    earlier = datetime(2026, 4, 20, tzinfo=timezone.utc)
    later = datetime(2026, 4, 28, tzinfo=timezone.utc)
    for ts in (earlier, later):
        a = Assessment(
            organization_id=teacher_org.id,
            created_by_user_id=teacher_user.id,
            student_id=student.id,
            answer_key_id=key.id,
            status=AssessmentStatus.completed,
            uploaded_at=ts,
        )
        db.add(a)
    await db.flush()
    # Each assessment needs at least one page so it's not filtered out
    for a in (await db.execute(select(Assessment).where(Assessment.answer_key_id == key.id))).scalars():
        db.add(AssessmentPage(assessment_id=a.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    resp = await teacher_client.get("/api/answer-keys")
    keys = resp.json()["answer_keys"]
    assert keys[0]["usage"]["used_count"] == 2
    assert keys[0]["usage"]["last_used_at"].startswith("2026-04-28")


async def test_list_answer_keys_excludes_soft_deleted_assessments_from_usage(
    teacher_client, db, teacher_org, teacher_user
):
    key = AnswerKey(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        name="Key",
    )
    student = Student(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        full_name="Test Student",
    )
    db.add_all([key, student])
    await db.flush()
    db.add(AnswerKeyPage(answer_key_id=key.id, organization_id=teacher_org.id, page_number=1, original_filename="p1.png", s3_url="s3://k/p1.png"))

    a_alive = Assessment(
        organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
        student_id=student.id, answer_key_id=key.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
    )
    a_deleted = Assessment(
        organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
        student_id=student.id, answer_key_id=key.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 22, tzinfo=timezone.utc),
        deleted_at=datetime(2026, 4, 23, tzinfo=timezone.utc),
    )
    db.add_all([a_alive, a_deleted])
    await db.flush()
    db.add(AssessmentPage(assessment_id=a_alive.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    db.add(AssessmentPage(assessment_id=a_deleted.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    resp = await teacher_client.get("/api/answer-keys")
    keys = resp.json()["answer_keys"]
    assert keys[0]["usage"]["used_count"] == 1
    assert keys[0]["usage"]["last_used_at"].startswith("2026-04-20")
```

Add the imports at the top of the test file if not present:

```python
from datetime import datetime, timezone
from sqlalchemy import select
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.answer_key_page import AnswerKeyPage
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.student import Student
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && uv run pytest tests/routers/test_answer_keys_router.py -v -k usage`
Expected: 3 FAILS (`KeyError: 'usage'` or pydantic validation errors).

- [ ] **Step 4: Implement the usage subquery in the router**

Edit `apps/api/src/grade_sight_api/routers/answer_keys.py`. Inside
`list_answer_keys` (around lines 48-128) — the current code calls
`(await db.execute(stmt)).all()` directly inside a `for` and consumes
each row immediately. We need to pull the result into a local list
first, then run the usage aggregation, then build items.

Replace the current `for key_row, page_count, first_page_key in result.all():`
loop body with the structure below. The variable `stmt` is the existing
`select(AnswerKey, page_count_subq, first_page_subq).join(...)` query
already built above; do not change it.

```python
rows = (await db.execute(stmt)).all()
key_ids = [k.id for k, _, _ in rows]

usage_map: dict[UUID, AnswerKeyUsage] = {}
if key_ids:
    usage_stmt = (
        select(
            Assessment.answer_key_id,
            func.count(Assessment.id).label("used_count"),
            func.max(Assessment.uploaded_at).label("last_used_at"),
        )
        .where(
            Assessment.answer_key_id.in_(key_ids),
            Assessment.deleted_at.is_(None),
        )
        .group_by(Assessment.answer_key_id)
    )
    for ak_id, count, last_at in (await db.execute(usage_stmt)).all():
        usage_map[ak_id] = AnswerKeyUsage(used_count=int(count), last_used_at=last_at)

items: list[AnswerKeySummary] = []
for key_row, page_count, first_page_key in rows:
    if first_page_key is None:
        continue
    thumb_url = await storage_service.get_download_url(
        ctx=ctx,            # existing CallContext from the current code; keep as-is
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
            usage=usage_map.get(
                key_row.id,
                AnswerKeyUsage(used_count=0, last_used_at=None),
            ),
        )
    )
```

The existing `ctx = CallContext(organization_id=..., user_id=..., request_type="answer_key_list_thumbnails", contains_pii=False, audit_reason="render answer key picker thumbnails")` setup above the loop stays unchanged.

Add the import at the top of the router file:

```python
from grade_sight_api.schemas.answer_keys import AnswerKeyUsage
```

- [ ] **Step 5: Run all answer-keys tests to verify pass + no regressions**

Run: `cd apps/api && uv run pytest tests/routers/test_answer_keys_router.py -v`
Expected: All tests PASS.

- [ ] **Step 6: Run mypy**

Run: `cd apps/api && uv run mypy src tests`
Expected: PASS, no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/answer_keys.py apps/api/src/grade_sight_api/routers/answer_keys.py apps/api/tests/routers/test_answer_keys_router.py
git commit -m "api: add usage (used_count + last_used_at) per answer key in list response"
```

---

## Task 4 · Backend · Assessment list schema additions

**Why split from Task 5:** Schema-only commit makes the type changes reviewable before any query logic touches them. Task 5 then implements the population.

**Files:**
- Modify: `apps/api/src/grade_sight_api/schemas/assessments.py`

- [ ] **Step 1: Add HeadlineProblem, HeadlineInputs, and pagination fields**

Edit `apps/api/src/grade_sight_api/schemas/assessments.py`. After the existing `AssessmentListItem` definition (around line 39-46), add the new types and extend the response:

```python
class HeadlineProblem(BaseModel):
    problem_number: int
    is_correct: bool
    error_pattern_slug: str | None = None
    error_pattern_name: str | None = None


class HeadlineInputs(BaseModel):
    total_problems_seen: int | None = None
    overall_summary: str | None = None
    problems: list[HeadlineProblem]


class AssessmentListItem(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    page_count: int
    first_page_thumbnail_url: str
    status: AssessmentStatus
    uploaded_at: datetime
    has_key: bool                           # NEW
    headline_inputs: HeadlineInputs | None  # NEW: null when no diagnosis exists yet


class AssessmentListResponse(BaseModel):
    assessments: list[AssessmentListItem]
    has_more: bool                          # NEW
    next_cursor: datetime | None            # NEW
```

- [ ] **Step 2: Run mypy to confirm no breakage downstream**

Run: `cd apps/api && uv run mypy src`
Expected: existing usages of `AssessmentListItem` (in the router) will fail because `has_key` and `headline_inputs` are now required. That's intentional — Task 5 fills them in. For now, expect the FastAPI router file to error.

If mypy is too noisy, add a temporary `# type: ignore` or `Optional` defaults — but this is the moment we want the failure visible, so leave it.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/assessments.py
git commit -m "api: add HeadlineProblem/HeadlineInputs schemas + pagination envelope on assessment list"
```

---

## Task 5 · Backend · Assessment list query extension

**Files:**
- Modify: `apps/api/src/grade_sight_api/routers/assessments.py`
- Test: `apps/api/tests/routers/test_assessments_router.py`

**Approach:** restructure the `list_assessments` endpoint to:
1. Apply `since` / `until` / `cursor` filters
2. Fetch `limit + 1` rows to determine `has_more`
3. Batch-fetch diagnoses + observations + reviews + patterns for the returned assessment ids
4. Apply the Step 11a `apply_reviews_to_problems` overlay per assessment
5. Build `HeadlineInputs` per row

- [ ] **Step 1: Write failing test for `has_key` field**

Add to `apps/api/tests/routers/test_assessments_router.py`:

```python
async def test_list_assessments_has_key_reflects_answer_key_id(
    teacher_client, db, teacher_org, teacher_user
):
    student = Student(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        full_name="Student",
    )
    key = AnswerKey(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        name="Key",
    )
    db.add_all([student, key])
    await db.flush()

    a_with_key = Assessment(
        organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
        student_id=student.id, answer_key_id=key.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )
    a_no_key = Assessment(
        organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
        student_id=student.id, answer_key_id=None,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 27, tzinfo=timezone.utc),
    )
    db.add_all([a_with_key, a_no_key])
    await db.flush()
    for a in (a_with_key, a_no_key):
        db.add(AssessmentPage(assessment_id=a.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    resp = await teacher_client.get("/api/assessments")
    assessments = resp.json()["assessments"]
    by_id = {a["id"]: a for a in assessments}
    assert by_id[str(a_with_key.id)]["has_key"] is True
    assert by_id[str(a_no_key.id)]["has_key"] is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && uv run pytest tests/routers/test_assessments_router.py::test_list_assessments_has_key_reflects_answer_key_id -v`
Expected: FAIL — pydantic validation error (missing `has_key`).

- [ ] **Step 3: Implement `has_key` (minimal change in the existing loop)**

Edit `apps/api/src/grade_sight_api/routers/assessments.py`. In `list_assessments` (around lines 148-234), inside the `for assessment, student_name, page_count, first_page_key in result.all():` loop, change the `AssessmentListItem` construction to include:

```python
items.append(
    AssessmentListItem(
        id=assessment.id,
        student_id=assessment.student_id,
        student_name=student_name,
        page_count=int(page_count or 0),
        first_page_thumbnail_url=thumb_url,
        status=assessment.status,
        uploaded_at=assessment.uploaded_at,
        has_key=assessment.answer_key_id is not None,  # NEW
        headline_inputs=None,  # placeholder, populated in Step 7
    )
)
```

Also update the `AssessmentListResponse(...)` return at the bottom to:

```python
return AssessmentListResponse(
    assessments=items,
    has_more=False,    # placeholder, populated in Step 9
    next_cursor=None,
)
```

- [ ] **Step 4: Run all assessments tests to verify pass + no regression**

Run: `cd apps/api && uv run pytest tests/routers/test_assessments_router.py -v`
Expected: PASS, including the new `has_key` test.

- [ ] **Step 5: Write failing tests for `headline_inputs` shape and review overlay**

Add to `apps/api/tests/routers/test_assessments_router.py`:

```python
async def test_list_assessments_headline_inputs_null_for_processing(
    teacher_client, db, teacher_org, teacher_user
):
    student = Student(
        organization_id=teacher_org.id,
        created_by_user_id=teacher_user.id,
        full_name="S",
    )
    db.add(student)
    await db.flush()
    a = Assessment(
        organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
        student_id=student.id,
        status=AssessmentStatus.processing,
        uploaded_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )
    db.add(a)
    await db.flush()
    db.add(AssessmentPage(assessment_id=a.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    resp = await teacher_client.get("/api/assessments")
    [row] = resp.json()["assessments"]
    assert row["headline_inputs"] is None


async def test_list_assessments_headline_inputs_populated_for_completed(
    teacher_client, db, teacher_org, teacher_user, sign_drop_pattern
):
    # Builds a completed assessment with diagnosis + 3 problem observations
    # (1 correct, 2 wrong with sign_drop pattern) and verifies
    # headline_inputs.problems contains those 3 entries.
    student, a = await _seed_completed_assessment(
        db, teacher_org, teacher_user,
        problems=[
            {"problem_number": 1, "is_correct": True, "pattern_id": None},
            {"problem_number": 2, "is_correct": False, "pattern_id": sign_drop_pattern.id},
            {"problem_number": 3, "is_correct": False, "pattern_id": sign_drop_pattern.id},
        ],
        total_problems_seen=3,
        overall_summary="2 of 3 wrong on sign drops.",
    )

    resp = await teacher_client.get("/api/assessments")
    [row] = resp.json()["assessments"]
    hi = row["headline_inputs"]
    assert hi["total_problems_seen"] == 3
    assert hi["overall_summary"] == "2 of 3 wrong on sign drops."
    assert len(hi["problems"]) == 3
    assert hi["problems"][0]["problem_number"] == 1
    assert hi["problems"][0]["is_correct"] is True
    assert hi["problems"][1]["error_pattern_slug"] == "sign-drop"


async def test_list_assessments_headline_inputs_reflects_review_overlay(
    teacher_client, db, teacher_org, teacher_user, sign_drop_pattern
):
    # Same setup as above; then add a DiagnosticReview marking problem 2 as correct.
    # headline_inputs.problems[1].is_correct should be True after overlay.
    student, a = await _seed_completed_assessment(
        db, teacher_org, teacher_user,
        problems=[
            {"problem_number": 2, "is_correct": False, "pattern_id": sign_drop_pattern.id},
        ],
        total_problems_seen=1,
    )
    db.add(DiagnosticReview(
        assessment_id=a.id,
        organization_id=teacher_org.id,
        reviewer_user_id=teacher_user.id,
        problem_number=2,
        marked_correct=True,
        override_pattern_id=None,
        note=None,
    ))
    await db.commit()

    resp = await teacher_client.get("/api/assessments")
    [row] = resp.json()["assessments"]
    hi = row["headline_inputs"]
    assert hi["problems"][0]["is_correct"] is True  # overlay applied
```

A `_seed_completed_assessment` test helper will need to exist at the top of this file. If not present, define it:

```python
async def _seed_completed_assessment(db, org, user, problems, total_problems_seen=None, overall_summary="ok"):
    student = Student(
        organization_id=org.id, created_by_user_id=user.id, full_name="S",
    )
    db.add(student)
    await db.flush()
    a = Assessment(
        organization_id=org.id, created_by_user_id=user.id,
        student_id=student.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )
    db.add(a)
    await db.flush()
    db.add(AssessmentPage(assessment_id=a.id, organization_id=org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    diag = AssessmentDiagnosis(
        assessment_id=a.id, organization_id=org.id,
        total_problems_seen=total_problems_seen or len(problems),
        overall_summary=overall_summary,
    )
    db.add(diag)
    await db.flush()
    for p in problems:
        db.add(ProblemObservation(
            assessment_id=a.id, organization_id=org.id,
            problem_number=p["problem_number"],
            is_correct=p["is_correct"],
            error_pattern_id=p["pattern_id"],
        ))
    await db.commit()
    return student, a
```

- [ ] **Step 6: Run the new tests to verify they fail**

Run: `cd apps/api && uv run pytest tests/routers/test_assessments_router.py -v -k "headline_inputs or review_overlay"`
Expected: FAILs — `headline_inputs is None` for completed (because we hardcoded None in Step 3).

- [ ] **Step 7: Implement `headline_inputs` assembly with the review overlay**

This is the main backend work. Restructure `list_assessments` in `apps/api/src/grade_sight_api/routers/assessments.py`. After the existing main query (the one fetching `Assessment + Student.full_name + page_count + first_page_key`), capture rows once, then run 3 batch queries:

```python
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.schemas.assessments import (
    HeadlineInputs, HeadlineProblem, ProblemObservationResponse,
)
from grade_sight_api.services.diagnostic_review_service import (
    apply_reviews_to_problems, OverlayInputs,
)

# ... after the existing main query loop captures `rows` ...

assessment_ids = [a.id for a, *_ in rows]
diagnoses_by_aid: dict[UUID, AssessmentDiagnosis] = {}
problems_by_aid: dict[UUID, list[ProblemObservationResponse]] = {}
reviews_by_aid: dict[UUID, list[DiagnosticReview]] = {}
pattern_index: dict[UUID, ErrorPattern] = {}

if assessment_ids:
    # 1. Diagnoses
    for d in (await db.execute(
        select(AssessmentDiagnosis)
        .where(
            AssessmentDiagnosis.assessment_id.in_(assessment_ids),
            AssessmentDiagnosis.deleted_at.is_(None),
        )
    )).scalars():
        diagnoses_by_aid[d.assessment_id] = d

    # 2. Problem observations + their patterns
    obs_stmt = (
        select(ProblemObservation, ErrorPattern, ErrorCategory)
        .outerjoin(ErrorPattern, ProblemObservation.error_pattern_id == ErrorPattern.id)
        .outerjoin(ErrorSubcategory, ErrorPattern.subcategory_id == ErrorSubcategory.id)
        .outerjoin(ErrorCategory, ErrorSubcategory.category_id == ErrorCategory.id)
        .where(
            ProblemObservation.assessment_id.in_(assessment_ids),
            ProblemObservation.deleted_at.is_(None),
        )
        .order_by(ProblemObservation.assessment_id, ProblemObservation.problem_number)
    )
    for obs, pattern, category in (await db.execute(obs_stmt)).all():
        problems_by_aid.setdefault(obs.assessment_id, []).append(
            ProblemObservationResponse(
                problem_number=obs.problem_number,
                is_correct=obs.is_correct,
                error_pattern_slug=pattern.slug if pattern else None,
                error_pattern_name=pattern.name if pattern else None,
                error_category_slug=category.slug if category else None,
                review=None,  # populated by overlay
            )
        )

    # 3. Reviews
    for r in (await db.execute(
        select(DiagnosticReview)
        .where(
            DiagnosticReview.assessment_id.in_(assessment_ids),
            DiagnosticReview.deleted_at.is_(None),
        )
    )).scalars():
        reviews_by_aid.setdefault(r.assessment_id, []).append(r)

    # 4. Pattern index for overlay (covers both observation patterns + override patterns)
    pattern_ids: set[UUID] = set()
    for plist in problems_by_aid.values():
        for p in plist:
            # we don't have id here from the response; build pattern_index from override usage.
            pass
    override_ids = {r.override_pattern_id for rs in reviews_by_aid.values() for r in rs if r.override_pattern_id is not None}
    if override_ids:
        for p in (await db.execute(
            select(ErrorPattern).where(ErrorPattern.id.in_(override_ids))
        )).scalars():
            pattern_index[p.id] = p
```

Then build `HeadlineInputs` per assessment, applying the overlay:

```python
def _build_headline_inputs(aid: UUID) -> HeadlineInputs | None:
    diag = diagnoses_by_aid.get(aid)
    if diag is None:
        return None
    raw_problems = problems_by_aid.get(aid, [])
    reviews = reviews_by_aid.get(aid, [])
    effective = apply_reviews_to_problems(
        OverlayInputs(problems=raw_problems, reviews=reviews, pattern_index=pattern_index)
    )
    return HeadlineInputs(
        total_problems_seen=diag.total_problems_seen,
        overall_summary=diag.overall_summary,
        problems=[
            HeadlineProblem(
                problem_number=p.problem_number,
                is_correct=p.is_correct,
                error_pattern_slug=p.error_pattern_slug,
                error_pattern_name=p.error_pattern_name,
            )
            for p in effective
        ],
    )
```

Update the `AssessmentListItem` construction to use `headline_inputs=_build_headline_inputs(assessment.id)` instead of `None`. Status gating: only build headline inputs for `completed` assessments — `pending` / `processing` / `failed` keep `headline_inputs=None`:

```python
hi = _build_headline_inputs(assessment.id) if assessment.status == AssessmentStatus.completed else None
items.append(
    AssessmentListItem(
        ...,
        has_key=assessment.answer_key_id is not None,
        headline_inputs=hi,
    )
)
```

- [ ] **Step 8: Run all assessment tests to verify pass**

Run: `cd apps/api && uv run pytest tests/routers/test_assessments_router.py -v`
Expected: All PASS, including new headline tests.

- [ ] **Step 9: Write failing tests for date filter + cursor pagination**

Add to `apps/api/tests/routers/test_assessments_router.py`:

```python
async def test_list_assessments_since_filter(
    teacher_client, db, teacher_org, teacher_user
):
    student = Student(organization_id=teacher_org.id, created_by_user_id=teacher_user.id, full_name="S")
    db.add(student); await db.flush()

    for d in (15, 20, 25, 30):
        a = Assessment(
            organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
            student_id=student.id,
            status=AssessmentStatus.completed,
            uploaded_at=datetime(2026, 4, d, tzinfo=timezone.utc),
        )
        db.add(a); await db.flush()
        db.add(AssessmentPage(assessment_id=a.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    resp = await teacher_client.get("/api/assessments?since=2026-04-22")
    dates = [a["uploaded_at"][:10] for a in resp.json()["assessments"]]
    # Assessments on/after 2026-04-22; 25 and 30 qualify
    assert dates == ["2026-04-30", "2026-04-25"]


async def test_list_assessments_until_filter_inclusive(
    teacher_client, db, teacher_org, teacher_user
):
    student = Student(organization_id=teacher_org.id, created_by_user_id=teacher_user.id, full_name="S")
    db.add(student); await db.flush()
    for d in (15, 20, 25, 30):
        a = Assessment(
            organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
            student_id=student.id,
            status=AssessmentStatus.completed,
            uploaded_at=datetime(2026, 4, d, 14, 0, tzinfo=timezone.utc),
        )
        db.add(a); await db.flush()
        db.add(AssessmentPage(assessment_id=a.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    resp = await teacher_client.get("/api/assessments?until=2026-04-25")
    dates = [a["uploaded_at"][:10] for a in resp.json()["assessments"]]
    # Inclusive on Apr 25 (server expands until to < 2026-04-26 00:00 UTC)
    assert dates == ["2026-04-25", "2026-04-20", "2026-04-15"]


async def test_list_assessments_cursor_pagination(
    teacher_client, db, teacher_org, teacher_user
):
    student = Student(organization_id=teacher_org.id, created_by_user_id=teacher_user.id, full_name="S")
    db.add(student); await db.flush()
    for d in (26, 27, 28, 29, 30):
        a = Assessment(
            organization_id=teacher_org.id, created_by_user_id=teacher_user.id,
            student_id=student.id,
            status=AssessmentStatus.completed,
            uploaded_at=datetime(2026, 4, d, 14, 0, tzinfo=timezone.utc),
        )
        db.add(a); await db.flush()
        db.add(AssessmentPage(assessment_id=a.id, organization_id=teacher_org.id, page_number=1, original_filename="p.png", s3_url="s3://a/p.png"))
    await db.commit()

    # Page 1: limit=2, no cursor → Apr 30, 29
    r1 = await teacher_client.get("/api/assessments?limit=2")
    body1 = r1.json()
    assert [a["uploaded_at"][:10] for a in body1["assessments"]] == ["2026-04-30", "2026-04-29"]
    assert body1["has_more"] is True
    assert body1["next_cursor"] is not None
    assert body1["next_cursor"].startswith("2026-04-29")

    # Page 2: cursor = end of page 1 → Apr 28, 27
    r2 = await teacher_client.get(f"/api/assessments?limit=2&cursor={body1['next_cursor']}")
    body2 = r2.json()
    assert [a["uploaded_at"][:10] for a in body2["assessments"]] == ["2026-04-28", "2026-04-27"]
    assert body2["has_more"] is True

    # Page 3: cursor = end of page 2 → Apr 26 alone, no more
    r3 = await teacher_client.get(f"/api/assessments?limit=2&cursor={body2['next_cursor']}")
    body3 = r3.json()
    assert [a["uploaded_at"][:10] for a in body3["assessments"]] == ["2026-04-26"]
    assert body3["has_more"] is False
    assert body3["next_cursor"] is None
```

- [ ] **Step 10: Run the new tests to verify they fail**

Run: `cd apps/api && uv run pytest tests/routers/test_assessments_router.py -v -k "since or until or cursor"`
Expected: FAILs — params not honored.

- [ ] **Step 11: Implement date filter + cursor pagination**

Edit `apps/api/src/grade_sight_api/routers/assessments.py`. Update the `list_assessments` signature and the main query:

```python
from datetime import date, timedelta
from fastapi import Query

@router.get("/api/assessments", response_model=AssessmentListResponse)
async def list_assessments(
    limit: int = Query(default=50, ge=1, le=100),
    since: date | None = None,
    until: date | None = None,
    cursor: datetime | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AssessmentListResponse:
    ...
    stmt = (
        select(Assessment, Student.full_name, page_count_subq.c.page_count, first_page_subq.c.first_page_key)
        .join(Student, Assessment.student_id == Student.id)
        .join(page_count_subq, Assessment.id == page_count_subq.c.assessment_id, isouter=True)
        .join(first_page_subq, Assessment.id == first_page_subq.c.assessment_id, isouter=True)
        .where(
            Assessment.organization_id == user.organization_id,
            Assessment.deleted_at.is_(None),
        )
    )
    if since is not None:
        stmt = stmt.where(Assessment.uploaded_at >= datetime.combine(since, datetime.min.time(), tzinfo=timezone.utc))
    if until is not None:
        stmt = stmt.where(Assessment.uploaded_at < datetime.combine(until + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    if cursor is not None:
        stmt = stmt.where(Assessment.uploaded_at < cursor)

    stmt = stmt.order_by(Assessment.uploaded_at.desc()).limit(limit + 1)
    rows = (await db.execute(stmt)).all()

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = rows[-1][0].uploaded_at if has_more else None
```

And at the return:

```python
return AssessmentListResponse(
    assessments=items,
    has_more=has_more,
    next_cursor=next_cursor,
)
```

- [ ] **Step 12: Run all assessment tests to verify pass**

Run: `cd apps/api && uv run pytest tests/routers/test_assessments_router.py -v`
Expected: All PASS.

- [ ] **Step 13: Run full backend test suite + mypy**

Run: `cd apps/api && uv run pytest && uv run mypy src tests`
Expected: PASS, no regressions.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/grade_sight_api/routers/assessments.py apps/api/tests/routers/test_assessments_router.py
git commit -m "api: add date filter, cursor pagination, has_key, headline_inputs to /api/assessments"
```

---

## Task 6 · Frontend · Types + fetch helpers

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Add HeadlineProblem, HeadlineInputs, AnswerKeyUsage to types**

Edit `apps/web/lib/types.ts`. Add:

```ts
export interface HeadlineProblem {
  problem_number: number;
  is_correct: boolean;
  error_pattern_slug: string | null;
  error_pattern_name: string | null;
}

export interface HeadlineInputs {
  total_problems_seen: number | null;
  overall_summary: string | null;
  problems: HeadlineProblem[];
}

export interface AnswerKeyUsage {
  used_count: number;
  last_used_at: string | null;  // ISO datetime
}
```

Then extend the existing `AssessmentListItem` and `AnswerKey` interfaces:

```ts
export interface AssessmentListItem {
  // existing fields...
  has_key: boolean;
  headline_inputs: HeadlineInputs | null;
}

export interface AnswerKey {
  // existing fields...
  usage: AnswerKeyUsage;
}

export interface AssessmentListResponse {
  assessments: AssessmentListItem[];
  has_more: boolean;
  next_cursor: string | null;
}
```

- [ ] **Step 2: Update `fetchAssessments` to accept new query params**

Edit `apps/web/lib/api.ts`. Find the existing `fetchAssessments` function and extend its signature:

```ts
export async function fetchAssessments(opts?: {
  limit?: number;
  since?: string;     // ISO date "YYYY-MM-DD"
  until?: string;
  cursor?: string;    // ISO datetime
}): Promise<AssessmentListResponse> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.since) params.set("since", opts.since);
  if (opts?.until) params.set("until", opts.until);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const url = `/api/assessments${qs ? `?${qs}` : ""}`;
  return await authedFetch<AssessmentListResponse>(url);
}
```

(The existing dashboard caller passes `{ limit: 10 }` — that signature still works.)

- [ ] **Step 3: Run frontend typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS, including dashboard's existing call.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/api.ts
git commit -m "web: add types + fetch params for archive (since/until/cursor) and key usage"
```

---

## Task 7 · Frontend · `renderHeadline` helper

**Files:**
- Modify: `apps/web/lib/diagnosis-sentence.ts`
- Test: `apps/web/lib/diagnosis-sentence.test.ts` (existing or new)

- [ ] **Step 1: Write failing tests**

Create or edit `apps/web/lib/diagnosis-sentence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderHeadline } from "./diagnosis-sentence";

describe("renderHeadline", () => {
  it("returns text directly for fallback variant", () => {
    expect(renderHeadline({ kind: "fallback", text: "Diagnostic complete." })).toBe("Diagnostic complete.");
  });

  it("joins lead + accent for structured with accent", () => {
    expect(
      renderHeadline({
        kind: "structured",
        score: "5 of 8",
        lead: "3 of 3 wrong answers share the same pattern:",
        accentPhrase: "Negative distribution",
      }),
    ).toBe("3 of 3 wrong answers share the same pattern: Negative distribution");
  });

  it("returns lead alone when accentPhrase is null", () => {
    expect(
      renderHeadline({
        kind: "structured",
        score: "1 of 1",
        lead: "No mistakes worth flagging.",
        accentPhrase: null,
      }),
    ).toBe("No mistakes worth flagging.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test diagnosis-sentence.test.ts`
Expected: FAIL — `renderHeadline is not exported`.

- [ ] **Step 3: Add `renderHeadline` to `diagnosis-sentence.ts`**

Edit `apps/web/lib/diagnosis-sentence.ts`. Append:

```ts
export function renderHeadline(s: TopSentence): string {
  if (s.kind === "fallback") return s.text;
  return s.accentPhrase ? `${s.lead} ${s.accentPhrase}` : s.lead;
}
```

- [ ] **Step 4: Run test + verify pass**

Run: `cd apps/web && pnpm test diagnosis-sentence.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/diagnosis-sentence.ts apps/web/lib/diagnosis-sentence.test.ts
git commit -m "web: add renderHeadline helper for archive row labels"
```

---

## Task 8 · Frontend · `/keys` library components

**Files:**
- Create: `apps/web/components/keys/key-card.tsx`
- Create: `apps/web/components/keys/add-key-card.tsx`
- Create: `apps/web/components/keys/add-key-dialog.tsx`
- Create: `apps/web/components/keys/add-key-button.tsx`
- Create: `apps/web/components/keys/key-card-grid.tsx`
- Create: `apps/web/components/keys/empty-key-library.tsx`
- Create: `apps/web/components/keys/key-library-header.tsx`
- Create: `apps/web/components/keys/why-key-library-note.tsx`

- [ ] **Step 1: Create `key-card.tsx`**

```tsx
// apps/web/components/keys/key-card.tsx
import Image from "next/image";
import type { AnswerKey } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (iso === null) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function KeyCard({ ak }: { ak: AnswerKey }) {
  const usage = ak.usage.used_count === 0
    ? "Never used yet"
    : `Used ${ak.usage.used_count}× · last ${formatDate(ak.usage.last_used_at)}`;

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-rule bg-paper">
      <div className="relative aspect-[3/2] bg-paper-soft border-b border-rule-soft">
        {ak.first_page_thumbnail_url && (
          <Image
            src={ak.first_page_thumbnail_url}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-contain"
          />
        )}
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-baseline justify-end font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          <span>{ak.page_count} {ak.page_count === 1 ? "page" : "pages"}</span>
        </div>
        <p className="font-serif text-lg leading-tight text-ink line-clamp-2">{ak.name}</p>
        <p className="text-sm text-ink-soft">{usage}</p>
      </div>
    </div>
  );
}
```

(Page count is right-aligned only — no "verified/draft" badge in v1
per spec §2: that needs its own parser-confidence brainstorm.)

- [ ] **Step 2: Create `add-key-dialog.tsx`**

```tsx
// apps/web/components/keys/add-key-dialog.tsx
"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnswerKeyUploadForm } from "@/components/answer-key-upload-form";

export function AddKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add answer key</DialogTitle>
        </DialogHeader>
        <AnswerKeyUploadForm
          onSuccess={() => {
            onOpenChange(false);
            onCreated();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

(If the existing `AnswerKeyUploadForm` doesn't accept an `onSuccess` callback, this task includes a small refactor: add an optional `onSuccess?: () => void` prop and call it after a successful POST. Inspect the file at `apps/web/components/answer-key-upload-form.tsx` to confirm.)

- [ ] **Step 3: Create `add-key-button.tsx`**

```tsx
// apps/web/components/keys/add-key-button.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddKeyDialog } from "./add-key-dialog";

export function AddKeyButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add answer key</Button>
      <AddKeyDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
```

- [ ] **Step 4: Create `add-key-card.tsx`**

```tsx
// apps/web/components/keys/add-key-card.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddKeyDialog } from "./add-key-dialog";

export function AddKeyCard() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-rule bg-paper p-8 text-center hover:bg-paper-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="font-serif text-lg text-ink">+ Add answer key</span>
        <span className="text-sm text-ink-soft max-w-[200px]">Photo, PDF, or type answers in.</span>
      </button>
      <AddKeyDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
```

- [ ] **Step 5: Create `key-card-grid.tsx`**

```tsx
// apps/web/components/keys/key-card-grid.tsx
import type { AnswerKey } from "@/lib/types";
import { KeyCard } from "./key-card";
import { AddKeyCard } from "./add-key-card";

export function KeyCardGrid({ keys }: { keys: AnswerKey[] }) {
  return (
    <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => <KeyCard key={k.id} ak={k} />)}
      <AddKeyCard />
    </div>
  );
}
```

- [ ] **Step 6: Create `empty-key-library.tsx`**

```tsx
// apps/web/components/keys/empty-key-library.tsx
import { AddKeyCard } from "./add-key-card";

export function EmptyKeyLibrary() {
  return (
    <div className="mx-auto max-w-md py-12">
      <p className="text-base text-ink-soft text-center mb-6">
        No keys yet. Upload your first one — verify once, reuse forever.
      </p>
      <AddKeyCard />
    </div>
  );
}
```

- [ ] **Step 7: Create `key-library-header.tsx`**

```tsx
// apps/web/components/keys/key-library-header.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { AddKeyButton } from "./add-key-button";

export function KeyLibraryHeader() {
  return (
    <header className="mb-10 flex items-end justify-between">
      <div>
        <SectionEyebrow>Library</SectionEyebrow>
        <div className="mt-3">
          <SerifHeadline level="page" as="h1">Answer keys</SerifHeadline>
        </div>
        <p className="mt-2 text-base text-ink-soft max-w-[640px]">
          Upload a key once, reuse it across periods.
        </p>
      </div>
      <AddKeyButton />
    </header>
  );
}
```

- [ ] **Step 8: Create `why-key-library-note.tsx`**

```tsx
// apps/web/components/keys/why-key-library-note.tsx
export function WhyKeyLibraryNote() {
  return (
    <section className="mt-14 grid gap-12 border-t border-rule-soft pt-8 md:grid-cols-[1fr_2fr]">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Why a key library
      </div>
      <p className="font-serif text-lg font-light leading-relaxed text-ink-soft">
        Without a key, Grade Sight reads what the teacher wrote. With a key,
        it can grade fresh, find subtler errors, and give parents a real
        "why" — not just "what was marked."{" "}
        <span className="text-ink">Most teachers upload one key per quiz; we use it across every section.</span>
      </p>
    </section>
  );
}
```

- [ ] **Step 9: Run typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/keys/
git commit -m "web: add /keys library components (card, grid, header, dialog, footer note)"
```

---

## Task 9 · Frontend · `/keys` page integration

**Files:**
- Create: `apps/web/app/keys/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/keys/page.tsx
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchAnswerKeys, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { KeyCardGrid } from "@/components/keys/key-card-grid";
import { EmptyKeyLibrary } from "@/components/keys/empty-key-library";
import { KeyLibraryHeader } from "@/components/keys/key-library-header";
import { WhyKeyLibraryNote } from "@/components/keys/why-key-library-note";

export default async function KeysPage() {
  const [user, list] = await Promise.all([fetchMe(), fetchAnswerKeys()]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/keys"
      uploadHref="/upload"
    >
      <PageContainer className="max-w-[1200px]">
        <KeyLibraryHeader />
        {list.answer_keys.length === 0 ? (
          <EmptyKeyLibrary />
        ) : (
          <KeyCardGrid keys={list.answer_keys} />
        )}
        <WhyKeyLibraryNote />
      </PageContainer>
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify build + typecheck**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: PASS, /keys route present in build output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/keys/page.tsx
git commit -m "web: add /keys page (teacher-only library)"
```

---

## Task 10 · Frontend · `/assessments` archive components

**Files:**
- Create: `apps/web/components/archive/archive-header.tsx`
- Create: `apps/web/components/archive/archive-filters.tsx`
- Create: `apps/web/components/archive/archive-row.tsx`
- Create: `apps/web/components/archive/archive-table.tsx`
- Create: `apps/web/components/archive/load-earlier-button.tsx`

- [ ] **Step 1: Create `archive-header.tsx`**

```tsx
// apps/web/components/archive/archive-header.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export function ArchiveHeader() {
  return (
    <header className="mb-8">
      <SectionEyebrow>Archive</SectionEyebrow>
      <div className="mt-3">
        <SerifHeadline level="page" as="h1">Assessments</SerifHeadline>
      </div>
      <p className="mt-2 text-base text-ink-soft">
        Everything you've uploaded, newest first.
      </p>
    </header>
  );
}
```

- [ ] **Step 2: Create `archive-filters.tsx`**

```tsx
// apps/web/components/archive/archive-filters.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
];

function computeSinceDate(value: string): string | null {
  const today = new Date();
  if (value === "all") return null;
  if (value === "year") return new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const days = Number(value);
  const d = new Date(today.getTime() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

function valueFromSince(since: string | null): string {
  if (!since) return "all";
  const today = new Date();
  if (since === new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10)) return "year";
  const sinceDate = new Date(since + "T00:00:00Z");
  const days = Math.round((today.getTime() - sinceDate.getTime()) / 86400000);
  if (days <= 8) return "7";
  if (days <= 31) return "30";
  return "90";
}

export function ArchiveFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const since = sp.get("since");
  const value = valueFromSince(since);

  function onChange(v: string) {
    const newSince = computeSinceDate(v);
    const params = new URLSearchParams(sp.toString());
    if (newSince) params.set("since", newSince);
    else params.delete("since");
    router.push(`/assessments${params.toString() ? "?" + params.toString() : ""}`);
  }

  return (
    <div className="mb-6 flex items-center gap-3">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 3: Create `archive-row.tsx`**

```tsx
// apps/web/components/archive/archive-row.tsx
import Link from "next/link";
import type { AssessmentListItem } from "@/lib/types";
import type { TopSentence } from "@/lib/diagnosis-sentence";
import { renderHeadline } from "@/lib/diagnosis-sentence";

interface RowData extends AssessmentListItem {
  headline: TopSentence | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: "neutral" | "muted" | "danger" }> = {
  pending: { label: "Awaiting upload", tone: "muted" },
  processing: { label: "Reading the quiz…", tone: "muted" },
  failed: { label: "Couldn't read — re-run from row", tone: "danger" },
  completed: { label: "", tone: "neutral" },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function ArchiveRow({ row }: { row: RowData }) {
  const status = STATUS_LABELS[row.status];
  const headlineText =
    row.headline ? renderHeadline(row.headline) : null;

  return (
    <tr className="border-t border-rule-soft hover:bg-paper-soft">
      <td className="py-4 pl-3 pr-4 align-baseline font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
        <Link href={`/assessments/${row.id}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {formatDate(row.uploaded_at)}
        </Link>
      </td>
      <td className="py-4 pr-4 align-baseline font-serif text-base text-ink">
        <Link href={`/assessments/${row.id}`}>{row.student_name}</Link>
      </td>
      <td className="py-4 pr-4 align-baseline font-mono text-xs uppercase tracking-[0.06em] text-ink-mute">
        {row.status === "completed" ? "—" : status.label}
      </td>
      <td className="py-4 pr-4 align-baseline font-mono text-xs">
        <span className={row.has_key ? "text-green" : "text-ink-mute"}>
          {row.has_key ? "● linked" : "○ none"}
        </span>
      </td>
      <td className="py-4 pr-4 align-baseline font-serif italic text-ink-soft line-clamp-1">
        {headlineText ?? <span className={status.tone === "danger" ? "text-mark not-italic" : ""}>{status.label}</span>}
      </td>
      <td className="py-4 pr-3 align-baseline text-right font-mono text-xs uppercase tracking-[0.1em] text-accent">
        ›
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Create `archive-table.tsx`**

```tsx
// apps/web/components/archive/archive-table.tsx
import type { AssessmentListItem } from "@/lib/types";
import type { TopSentence } from "@/lib/diagnosis-sentence";
import { ArchiveRow } from "./archive-row";

interface RowData extends AssessmentListItem { headline: TopSentence | null }

export function ArchiveTable({ rows, filtersActive }: { rows: RowData[]; filtersActive: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-base text-ink-soft">
        {filtersActive
          ? "No assessments match this date range."
          : "No assessments yet."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
      <table className="w-full text-left">
        <thead className="border-b border-rule-soft bg-paper-soft">
          <tr className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            <th className="py-3 pl-3 pr-4 font-normal">Date</th>
            <th className="py-3 pr-4 font-normal">Student</th>
            <th className="py-3 pr-4 font-normal">Status</th>
            <th className="py-3 pr-4 font-normal">Key</th>
            <th className="py-3 pr-4 font-normal">Headline</th>
            <th className="py-3 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <ArchiveRow key={r.id} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create `load-earlier-button.tsx`**

```tsx
// apps/web/components/archive/load-earlier-button.tsx
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fetchAssessments } from "@/lib/api";
import type { AssessmentListItem } from "@/lib/types";
import type { Role, TopSentence } from "@/lib/diagnosis-sentence";
import { buildTopSentence } from "@/lib/diagnosis-sentence";
import { ArchiveRow } from "./archive-row";

interface RowData extends AssessmentListItem { headline: TopSentence | null }

function buildRowData(items: AssessmentListItem[], role: Role): RowData[] {
  return items.map((a) => ({
    ...a,
    headline: a.headline_inputs ? buildTopSentence(a.headline_inputs as never, role) : null,
  }));
}

export function LoadEarlierButton({
  initialCursor,
  role,
  since,
}: {
  initialCursor: string;
  role: Role;
  since: string | null;
}) {
  const [appended, setAppended] = useState<RowData[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();

  if (cursor === null) return null;

  function loadMore() {
    startTransition(async () => {
      const resp = await fetchAssessments({ cursor, since: since ?? undefined, limit: 50 });
      setAppended((prev) => [...prev, ...buildRowData(resp.assessments, role)]);
      setCursor(resp.has_more ? resp.next_cursor : null);
    });
  }

  return (
    <>
      {appended.length > 0 && (
        <div className="mt-0 overflow-x-auto rounded-b-[var(--radius-md)] border border-rule border-t-0">
          <table className="w-full text-left">
            <tbody>
              {appended.map((r) => <ArchiveRow key={r.id} row={r} />)}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" onClick={loadMore} disabled={pending}>
          {pending ? "Loading…" : "Load earlier ↓"}
        </Button>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Run typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/archive/
git commit -m "web: add /assessments archive components (header, filters, row, table, load-earlier)"
```

---

## Task 11 · Frontend · `/assessments` page integration

**Files:**
- Create: `apps/web/app/assessments/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/assessments/page.tsx
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchAssessments, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { ArchiveHeader } from "@/components/archive/archive-header";
import { ArchiveFilters } from "@/components/archive/archive-filters";
import { ArchiveTable } from "@/components/archive/archive-table";
import { LoadEarlierButton } from "@/components/archive/load-earlier-button";
import { buildTopSentence, type Role, type TopSentence } from "@/lib/diagnosis-sentence";
import type { AssessmentListItem } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ since?: string; until?: string }>;
}

export default async function AssessmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const since = params.since;
  const until = params.until;

  const [user, list] = await Promise.all([
    fetchMe(),
    fetchAssessments({ since, until, limit: 50 }),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  const role: Role = "teacher";
  const rows = list.assessments.map((a) => ({
    ...a,
    headline: a.headline_inputs ? buildTopSentence(a.headline_inputs as never, role) : null,
  }));

  const filtersActive = since != null || until != null;
  const isFirstRunEmpty = !filtersActive && rows.length === 0;

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/assessments"
      uploadHref="/upload"
    >
      <PageContainer>
        <ArchiveHeader />
        {isFirstRunEmpty ? (
          <p className="mb-10 text-base text-ink-soft">
            No assessments yet. Upload your first one above.
          </p>
        ) : (
          <>
            <ArchiveFilters />
            <ArchiveTable rows={rows} filtersActive={filtersActive} />
            {list.has_more && list.next_cursor && (
              <LoadEarlierButton
                initialCursor={list.next_cursor}
                role={role}
                since={since ?? null}
              />
            )}
          </>
        )}
      </PageContainer>
    </AppShell>
  );
}
```

`ArchiveTable` accepts a `filtersActive` prop so its empty-state copy
can adapt — see Task 10 step 4 (already specified).

- [ ] **Step 2: Verify build + typecheck**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: PASS, /assessments route present.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/assessments/page.tsx
git commit -m "web: add /assessments archive page (teacher-only)"
```

---

## Task 12 · Manual visual verification

**Goal:** Run the dev server, exercise both pages and the a11y additions, confirm everything matches the spec's verification plan.

- [ ] **Step 1: Start the dev server**

```bash
cd apps/web && pnpm dev
```

In a parallel terminal:

```bash
cd apps/api && uv run uvicorn grade_sight_api.main:app --reload
```

- [ ] **Step 2: Verify `/assessments` as teacher**

Sign in as a teacher with mixed assessments (completed + pending + failed). Confirm:
- Table renders with the right columns
- Headlines appear in serif italic, line-clamped
- Status states correct (mono "Awaiting upload" / "Reading the quiz…" / red "Couldn't read")
- Click anywhere in a row navigates to `/assessments/[id]`

- [ ] **Step 3: Verify the date filter**

Apply "Last 7 days" → URL shows `?since=...`. Refresh → filter persists. Apply "All time" → URL clears.

- [ ] **Step 4: Verify load-more if applicable**

If you have > 50 assessments, click "Load earlier" → next 50 append, button disappears when no more.

- [ ] **Step 5: Verify `/keys` as teacher**

With keys: 3-col grid, "Used N× · last Apr X" or "Never used yet" shown correctly.
Click "Add answer key" in the header → modal opens with the existing form.
Submit a key → modal closes, grid refreshes.
Click the dashed Add card → same dialog.

- [ ] **Step 6: Verify empty states**

Sign in as a teacher with no assessments → empty-state copy on /assessments.
Sign in as a teacher with no keys → centered Add card on /keys.

- [ ] **Step 7: Verify auth gating**

Sign in as a parent and type `/assessments` and `/keys` directly → 404.

- [ ] **Step 8: Verify nav tabs**

Tab through `/dashboard` → `/students` → `/assessments` → `/keys` → `/students/[some-id]`. Active tab tracks current page.

- [ ] **Step 9: Verify a11y additions**

Press Tab from the URL bar. First focus stop is the "Skip to main content" link, which becomes visible.
Tab through the nav header. Each tab link shows a visible accent-colored ring on focus.

- [ ] **Step 10: Take screenshots**

Save screenshots of /assessments (populated) and /keys (populated) to `assets/screenshots/step-13a/` for the PR description.

- [ ] **Step 11: Stop the servers**

Ctrl-C both. No commit needed for this task — verification is the deliverable.

---

## Task 13 · PR open + squash-merge

**Files:** none — uses `gh` CLI.

- [ ] **Step 1: Run all gates one last time**

```bash
cd apps/api && uv run pytest && uv run mypy src tests
cd apps/web && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: ALL PASS.

- [ ] **Step 2: Push branch**

```bash
git push -u origin step-13a-archive-keys
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --base main --head step-13a-archive-keys --title "Step 13a · Archive + Answer-key library" --body "$(cat <<'EOF'
## Summary

- Adds `/assessments` — teacher-only archive table with date filter, load-more pagination, and per-row pattern headline (reusing Step 10's `buildTopSentence`).
- Adds `/keys` — teacher-only answer-key library with 3-col card grid (thumbnail + name + page count + usage line "Used N× · last Apr X").
- Extends `GET /api/assessments` (`since` / `until` / `cursor` / `limit`, plus `has_key` and `headline_inputs` per row, plus `has_more` / `next_cursor` envelope) and `GET /api/answer-keys` (per-row `usage` aggregation).
- A11y: adds skip-to-content link in `AppShell` and focus-visible ring on `AppHeader` tab links.
- Hoists `TEACHER_TABS` / `PARENT_TABS` from dashboard into `lib/nav.ts`; applies tabs to `/students` and `/students/[id]` (existing pages that previously rendered tabless).

## Architecture

- Single source of truth for the editorial sentence: `buildTopSentence` stays in TS. Backend returns enough denormalized data per row (`HeadlineInputs`) for the server component to call the helper inline. No Python port.
- Step 11a's `apply_reviews_to_problems` overlay is reused so the archive headline matches the diagnosis page after teacher reviews.
- Auth gating fail-fasts to `notFound()` for parent / no-user / no-org (matches Step 11b viewer pattern; no info disclosure).

## Followups captured

- `/keys/[id]` detail page — non-clickable cards in v1.
- Pattern + Has-key archive filters — post-MVP, paired with the glossary step.
- Verified-state badge on keys — needs parser-confidence brainstorm.
- Class-grade CSV export — belongs with bulk-grade (Step 13d).
- Roadmap re-sequenced: Step 13c (class flow) + 13d (bulk-grade) + 15a (nav polish) added to the launch path before Step 14 (print) and Step 15 (mobile).

## Test plan

- [x] Backend: pytest + mypy clean (new tests for `usage`, `has_key`, `headline_inputs`, review overlay, date filter, cursor pagination)
- [x] Frontend: typecheck + lint + vitest + build all pass (new tests for `renderHeadline`, AppShell skip link)
- [x] Manual visual verification per spec §7: archive populated/empty, filters, load-more, keys grid, AddKeyDialog, parent 404, tab nav, skip-link visible on focus, focus-ring on tabs

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for user OK then squash-merge**

After user reviews the PR and gives the go-ahead:

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only
```

---

## Notes for the implementer

- **Reuse `apply_reviews_to_problems` literally**, don't re-port the overlay logic. Look at how `biography_service.py` consumes it — same pattern applies here.
- **`<AnswerKeyUploadForm>` may need a small `onSuccess` prop addition.** Inspect the file before writing the dialog wrapper. If the prop is missing, add it and pipe through after a successful POST.
- **`fetchAssessments`** currently has signature `({ limit }: { limit?: number })` (or similar — verify). Extending it should keep the existing dashboard call working without changes.
- **`SectionEyebrow` is decorative-only** (mono uppercase tag, not clickable). Don't try to make it a breadcrumb — that's Step 15a.
- **Dashboard is unaffected** by the new params on `/api/assessments`. It still passes `{ limit: 10 }` and ignores the new `has_more`/`next_cursor` envelope fields.
- **Tabs hoisted in Task 1** are imported from `@/lib/nav` everywhere afterward — don't re-declare them locally.
- **The status row label "Couldn't read — re-run from row"** is intentional: clicking the row link takes the teacher to the diagnosis page where the existing re-run-from-failed flow already works (per the hotfix in commit `5b2bca8`).
