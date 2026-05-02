# Step 13a · Archive + Answer-key library — Design Spec

**Date:** 2026-05-01
**Branch (planned):** `step-13a-archive-keys`
**Scope:** Two teacher-only surfaces from the v2 handoff doc's Step 13
("Operational Surfaces") plus two cheap accessibility fixes that ride
along because we're already touching `AppShell` / `AppHeader`.

The third Step 13 surface (`/settings/privacy`) ships separately as
**Step 13b** with its own brainstorm; it's editorial-heavy and shares
no patterns with Archive + Keys.

---

## 1. Goal

Ship two read-mostly surfaces that turn Grade-Sight from "look at one
assessment at a time" into a durable workspace:

- **`/assessments`** — teacher-only archive table of every assessment,
  newest first, with a date filter and a one-line pattern headline per
  row. The row's headline reuses the same `buildTopSentence` logic that
  drives `/assessments/[id]`'s top sentence — single source of truth.
- **`/keys`** — teacher-only answer-key library, 3-col grid of cards
  showing thumbnail, name, page count, and usage ("Used 3× · last
  Apr 28"). Existing `<AnswerKeyUploadForm>` reused inside an
  `<AddKeyDialog>`; no key-detail page in v1.

Plus two a11y fixes (skip-to-content link in `AppShell`, focus-visible
ring on tabs in `AppHeader`) that benefit every page in the app.

## 2. What's in / out

### In scope (Step 13a)

- New page: `/assessments` (server component, teacher-only, `notFound()` for parent / no-user)
- New page: `/keys` (server component, teacher-only, `notFound()` for parent / no-user)
- Extension of `GET /api/assessments` — date filter, cursor pagination, `has_key`, `headline_inputs` per row
- Extension of `GET /api/answer-keys` — `usage` subquery (`used_count`, `last_used_at`) per row
- Hoist `TEACHER_TABS` / `PARENT_TABS` from `dashboard/page.tsx` into `lib/nav.ts`
- Apply tabs to `/students`, `/students/[id]`, `/assessments`, `/keys` (the first two are existing pages getting tabs added — they currently render with no top nav)
- Skip-to-content link in `AppShell`; focus-visible ring on tab links in `AppHeader`

### Out of scope (deferred items, captured in `followups.md` where relevant)

- `/keys/[id]` detail page — new followup
- Pattern filter on archive — followup ("Archive filters · post-MVP")
- Has-key filter on archive — followup (same)
- CSV export of archive — belongs with the bulk-grade workflow (Step 13d), one row per student in a class
- Mobile-responsive table / grid layouts — Step 15 (mobile)
- Breadcrumbs / global search / click-target enhancement — Step 15a (nav polish)
- "Verified vs draft" answer-key state — needs its own brainstorm (parser-confidence story)
- Items count per key (page count is close enough for v1)
- `/settings/privacy` — Step 13b, separate brainstorm

## 3. Architecture

### Routes

| Path | Auth | What it is |
|---|---|---|
| `/assessments` | teacher only (`notFound()` otherwise) | Archive table page |
| `/keys` | teacher only (`notFound()` otherwise) | Answer-key library page |

Auth gate matches the Step 11b viewer pattern: `notFound()` for
parent role / no-user / no-org. Avoids info disclosure (no 403).

### Backend extensions (no new endpoints)

`GET /api/assessments` — extended:

| New query param | Type | Default | Behavior |
|---|---|---|---|
| `since` | ISO date | none | inclusive on `assessments.uploaded_at >= since` |
| `until` | ISO date | none | server expands to `< (until + 1 day)` for inclusive whole-day |
| `cursor` | ISO datetime | none | strict `assessments.uploaded_at < cursor` for load-more |
| `limit` | int | **50** | max 100. Default raised from 20 → 50. Dashboard already passes `limit: 10` explicitly, so unaffected. |

New per-row fields and pagination envelope:

```python
class HeadlineProblem(BaseModel):
    problem_number: int
    is_correct: bool
    error_pattern_slug: str | None
    error_pattern_name: str | None

class HeadlineInputs(BaseModel):
    total_problems_seen: int | None
    overall_summary: str | None
    problems: list[HeadlineProblem]

class AssessmentListItem(BaseModel):
    # existing fields...
    has_key: bool                           # NEW: derived from answer_key_id IS NOT NULL
    headline_inputs: HeadlineInputs | None  # NEW: null when no diagnosis exists yet

class AssessmentListResponse(BaseModel):
    assessments: list[AssessmentListItem]
    has_more: bool                          # NEW: true if a next page exists
    next_cursor: datetime | None            # NEW: pass back as ?cursor= for next page; null when has_more is false
```

Pagination envelope is computed by fetching `limit + 1` rows from the
DB; if the extra row exists, `has_more = true` and `next_cursor` is
the `uploaded_at` of the **last returned** row (the strict-`<` cursor
the next page should use). Existing dashboard callers ignore the new
fields — they pass `limit: 10` and don't paginate.

Query plan (4 queries, follows the biography_service pattern):

1. List assessments + joined `Student.full_name`, `page_count_subq`,
   `first_page_subq` (existing). Apply since/until/cursor filters.
   Limit + order by `uploaded_at DESC`.
2. Fetch `AssessmentDiagnosis` rows for the returned assessment ids
   (`total_problems_seen`, `overall_summary`).
3. Fetch `ProblemObservation` rows joined with `ErrorPattern` for the
   returned assessment ids.
4. Fetch non-deleted `DiagnosticReview` rows for the returned
   assessment ids.

Stitch in Python: group observations by `assessment_id`, apply Step
11a's `apply_reviews_to_problems` overlay (reuse the helper, don't
reinvent), build one `HeadlineInputs` per assessment. The overlay is
what makes the archive headline match the diagnosis-page headline —
without it, a teacher who marked a problem correct on the diagnosis
page would see the old headline back on the archive list.

`GET /api/answer-keys` — extended:

```python
class AnswerKeyUsage(BaseModel):
    used_count: int                # non-deleted assessments referencing this key
    last_used_at: datetime | None  # max(assessments.uploaded_at) among them

class AnswerKeySummary(BaseModel):
    # existing fields...
    usage: AnswerKeyUsage  # NEW
```

Query plan (2 queries):

1. List keys with `page_count` + `first_page_thumbnail_url` (existing).
2. Aggregate usage:

```sql
SELECT answer_key_id,
       count(id) AS used_count,
       max(uploaded_at) AS last_used_at
FROM assessments
WHERE answer_key_id IN (:key_ids) AND deleted_at IS NULL
GROUP BY answer_key_id
```

Stitch by id; keys with no rows in the result get
`{used_count: 0, last_used_at: null}`.

### Auth note

Neither endpoint becomes teacher-only. Parents already call
`GET /api/assessments` from `/dashboard` (10-row recent-quizzes list).
Teacher-only gating happens at the **page** level (`/assessments`,
`/keys`), not the endpoint level — preserving the dashboard's existing
behavior and keeping the endpoint reusable.

### Frontend component layout

```
apps/web/components/archive/
  archive-header.tsx        (h1 + subhead)
  archive-filters.tsx       (Date chip, URL-bound, client)
  archive-table.tsx         (semantic <table> with thead/tbody)
  archive-row.tsx           (one row, headline clamped to 1 line)
  load-earlier-button.tsx   (client; fetches next 50 + appends)

apps/web/components/keys/
  key-library-header.tsx    (h1 + subhead + AddKeyButton)
  add-key-button.tsx        (client; opens AddKeyDialog)
  add-key-dialog.tsx        (client; wraps existing AnswerKeyUploadForm)
  key-card-grid.tsx         (3-col grid with AddKeyCard last)
  key-card.tsx              (thumbnail + name + usage line)
  add-key-card.tsx          (client; dashed-border tile, also opens dialog)
  empty-key-library.tsx     (single centered Add card + editorial copy)
  why-key-library-note.tsx  (editorial footer block)

apps/web/lib/nav.ts         (TEACHER_TABS + PARENT_TABS, hoisted)
```

Each component has one responsibility and a small interface. Page
files (`/assessments/page.tsx`, `/keys/page.tsx`) compose them.

### Single source of truth for the editorial sentence

`buildTopSentence` stays in TS. The list endpoint returns enough
denormalized data per row that the server component calls
`buildTopSentence(row.headline_inputs, role)` on each row before
passing to `<ArchiveRow>`. No Python port; one place to change the
sentence rules.

## 4. Frontend — `/assessments` archive

### Page composition

```tsx
// apps/web/app/assessments/page.tsx
export default async function AssessmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const since = parseDateParam(params.since);
  const until = parseDateParam(params.until);

  const [user, list] = await Promise.all([
    fetchMe(),
    fetchAssessments({ since, until, limit: 50 }),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  const role: Role = "teacher";
  const rows = list.assessments.map((a) => ({
    ...a,
    headline: a.headline_inputs
      ? buildTopSentence(a.headline_inputs, role)
      : null,
  }));

  return (
    <AppShell
      tabs={TEACHER_TABS}
      activeHref="/assessments"
      uploadHref="/upload"
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer>
        <ArchiveHeader />
        <ArchiveFilters since={since} until={until} />
        <ArchiveTable rows={rows} />
        {list.has_more && <LoadEarlierButton cursor={list.next_cursor} />}
      </PageContainer>
    </AppShell>
  );
}
```

### Components

| Component | Type | Responsibility |
|---|---|---|
| `ArchiveHeader` | server | `<SectionEyebrow>Archive</SectionEyebrow>` + serif H1 "Assessments" + 1-line subhead "Everything you've uploaded, newest first." |
| `ArchiveFilters` | client | Single Date `<Select>` chip. Options: All time (default — no params) / Last 7 / Last 30 / Last 90 / This year. Selecting writes `?since=...&until=...` via `router.push`; selecting "All time" clears the params. URL is the source of truth — no params means all-time, chip displays whichever option matches the current params. Custom range deferred. |
| `ArchiveTable` | server | Semantic `<table>` with real `<thead>`/`<tbody>`. Columns: Date · Student · Status · Key · Pattern headline · Open. Each row wraps content in a `<Link>` for click-anywhere-to-open. |
| `ArchiveRow` | server | Cells: mono date in `text-ink-soft`; serif student name in `text-ink`; status badge (existing pattern); "● linked" / "○ none" key indicator; serif italic headline (line-clamp-1); mono accent "›" arrow. |
| `LoadEarlierButton` | client | Below the table. On click: fetches next page via `?cursor=...`, appends rows to local state. Uses `useTransition` for the loading state. State in-memory only — refresh resets to first page (acceptable for v1). |

### Headline rendering helper

```ts
// in apps/web/lib/diagnosis-sentence.ts (alongside buildTopSentence)
export function renderHeadline(s: TopSentence): string {
  if (s.kind === "fallback") return s.text;
  return s.accentPhrase ? `${s.lead} ${s.accentPhrase}` : s.lead;
}
```

Render in serif italic, `line-clamp-1`.

### Status states (when `headline_inputs` is null)

| `status` | Headline cell shows |
|---|---|
| `pending` | mono uppercase "Awaiting upload" |
| `processing` | mono uppercase "Reading the quiz…" |
| `failed` | mono uppercase italic `text-mark` "Couldn't read — re-run from row" |
| `completed` | the actual headline string from `renderHeadline(buildTopSentence(...))` |

Re-run for failed assessments uses the existing `/diagnose` flow (the
diagnosis page already supports re-run-from-failed per the hotfix).

### Empty states

- **Zero assessments uploaded ever:** editorial copy "No assessments yet — upload your first one." + Upload CTA. No filter row, no table.
- **Filters active but zero matches:** keep filter chip visible, replace table with a quiet "No assessments match this date range. [Clear filter]" link that resets URL params.

## 5. Frontend — `/keys` library

### Page composition

```tsx
// apps/web/app/keys/page.tsx
export default async function KeysPage() {
  const [user, list] = await Promise.all([fetchMe(), fetchAnswerKeys()]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  return (
    <AppShell
      tabs={TEACHER_TABS}
      activeHref="/keys"
      uploadHref="/upload"
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
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

### Components

| Component | Type | Responsibility |
|---|---|---|
| `KeyLibraryHeader` | server | `<SectionEyebrow>Library</SectionEyebrow>` + serif H1 "Answer keys" + 1-line subhead "Upload a key once, reuse it across periods." Right side: `<AddKeyButton />`. |
| `AddKeyButton` | client | Solid-ink Button labeled "Add answer key". On click, opens `<AddKeyDialog>`. |
| `AddKeyDialog` | client | shadcn `<Dialog>` wrapping the existing `<AnswerKeyUploadForm>`. Passes an `onSuccess` callback that closes the dialog and calls `router.refresh()` to reload the server-rendered grid. |
| `KeyCardGrid` | server | CSS grid `grid-cols-3 gap-5` (responsive: 2 at md, 1 at sm). Last cell is `<AddKeyCard />`. |
| `KeyCard` | server | Page-preview thumbnail (real image from `first_page_thumbnail_url`), serif name, mono page count, usage line ("Used 3× · last Apr 28" or "Never used yet" if `used_count === 0`). Non-clickable in v1 (no detail page yet). |
| `AddKeyCard` | client | Dashed-border tile, same dimensions as a key card. Rendered as a `<button>` (not a `<div>` with `role="button"`) — semantic. Contains "+ Add answer key" + subhead. Click opens the same dialog. |
| `EmptyKeyLibrary` | server | Single centered `<AddKeyCard />` + elevated editorial copy. No grid wrapper. |
| `WhyKeyLibraryNote` | server | Editorial footer matching the canvas: 2-col layout — left col mono uppercase eyebrow "Why a key library", right col serif body explaining the value. |

### Date formatting

`last_used_at: datetime | null` — server-side format to "Apr 28" using
`Intl.DateTimeFormat("en-US", {month: "short", day: "numeric"})`. Never
display raw ISO.

### Why no "Open ›" affordance on cards in v1

The canvas shows each card with an "Open ›" arrow implying a
`/keys/[id]` detail page. We don't have one. Building it means another
route, another fetch, another component family — pure scope creep. The
card content (thumbnail + name + usage) tells the teacher what they
need to know. Editing/deleting a key already happens through
`AnswerKeyPicker` on `/upload`. A "key detail page" item is added to
`followups.md`.

## 6. Accessibility additions baked into Step 13a

These are one-time changes in `AppShell` / `AppHeader` that benefit
every page in the app, not just the new ones.

### Skip-to-content link in `AppShell`

```tsx
// apps/web/components/app-shell.tsx
<div className="flex min-h-screen flex-col bg-paper">
  <a
    href="#main"
    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
               focus:rounded-[var(--radius-sm)] focus:bg-ink focus:px-4 focus:py-2
               focus:text-paper"
  >
    Skip to main content
  </a>
  <SentryUserSync ... />
  <AppHeader ... />
  <main id="main" className="flex-1">{children}</main>
</div>
```

### Focus-visible ring on tab links in `AppHeader`

```tsx
// apps/web/components/app-header.tsx — tab Link className
className={cn(
  "border-b-2 pb-3.5 text-base transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
  "focus-visible:rounded-[var(--radius-sm)]",
  active
    ? "border-ink font-medium text-ink"
    : "border-transparent font-normal text-ink-soft hover:text-ink",
)}
```

Same focus pattern used on roster row links in `/students/page.tsx`.

## 7. Testing

### Backend tests (pytest)

`tests/routers/test_assessments_router.py` — additions:

- `since` only / `until` only / both / neither — date-window correctness
- `cursor` pagination — strict `<`, no boundary duplication, page-size respected
- `has_key` reflects `answer_key_id` (true / false / null distinguished)
- `headline_inputs` is `null` for `pending` / `processing` / `failed` assessments
- `headline_inputs.problems` shape matches `buildTopSentence`'s expected input
- `headline_inputs` reflects `diagnostic_reviews` overlay (mark-correct flips `is_correct` in the response)
- Cross-org isolation (existing pattern verified still passing)
- `limit` capped at 100; default raised from 20 → 50

`tests/routers/test_answer_keys_router.py` — additions:

- `usage.used_count` matches actual non-deleted assessment count
- `usage.last_used_at` matches `max(uploaded_at)`; `null` for unused keys
- Soft-deleted assessments excluded from usage count
- Keys from other orgs not counted

### Frontend tests (vitest + Testing Library)

Lightweight component tests, matching Step 12's patterns:

- `archive-row.test.tsx` — renders date, student name, key indicator, status badge, headline string; row is wrapped in a Link to `/assessments/[id]`
- `archive-filters.test.tsx` — selecting a date option writes the right `?since=&until=` params; "All time" clears params
- `load-earlier-button.test.tsx` — appends new rows on click, hides itself when no more pages
- `key-card.test.tsx` — renders thumbnail, name, page count, usage line; "Never used yet" shown when `used_count === 0`
- `add-key-card.test.tsx` — keyboard activation (Enter/Space) opens the dialog; matches click behavior

### Manual visual verification plan

Run dev server, hit each surface in browser:

1. `/assessments` as teacher with mixed assessments — table renders, headlines clamp, status states correct
2. `/assessments` as teacher with zero assessments — empty state copy + Upload CTA
3. `/assessments?since=2026-04-01` — filter survives back/forward navigation
4. `/assessments` with > 50 assessments — Load earlier button appends correctly
5. `/assessments` as parent (typed URL) — 404, no info disclosure
6. `/keys` as teacher with keys — grid renders, "Used N× · last Apr X" shows
7. `/keys` as teacher with zero keys — single centered Add card
8. Click "Add answer key" → modal opens with existing form → submit → modal closes, grid refreshes with new card
9. `/keys` as parent — 404
10. Tab through `/dashboard` → `/students` → `/assessments` → `/keys` — active tab tracks current page, no flicker
11. Skip-to-content: tab from URL bar — first focus stop is "Skip to main content" link, becomes visible
12. Focus ring: tab through nav — every tab link shows visible accent-colored ring on focus

### Edge cases

| Case | Handling |
|---|---|
| Teacher with no `organization_id` | Existing `/api/assessments` returns empty list — Archive shows empty state. |
| Assessment uploaded, diagnosis not yet computed (`status=processing`) | Row renders with mono "Reading the quiz…". Row still clickable — links to existing processing page. |
| Failed assessment | Row renders with `text-mark` "Couldn't read — re-run from row". Click opens diagnosis page where re-run flow already works. |
| Key with 0 usage | Usage line shows "Never used yet." Card otherwise normal. |
| Key with no first-page thumbnail (race during S3 upload) | Existing `/api/answer-keys` filters out keys without `first_page_key`. Continue that behavior. |
| Cursor pagination: cursor points to deleted assessment | Strict-`<` ordering on `uploaded_at` is unaffected — deleted row just doesn't appear. No error. |
| URL has malformed `since` like `?since=banana` | Backend pydantic validation returns 400. Frontend wraps fetch in try/catch and falls back to default window. |
| Teacher demotes to parent role mid-session | Next page load hits the `notFound()` gate. They see a 404. Graceful degradation. |

### Performance budget

- `/api/assessments` with full `headline_inputs`: < 300ms p95 on a 50-row response. Three batch fetches (no N+1). ~10 problems per assessment × 50 = ~500 problem rows joined to error_patterns. Comfortable.
- `/api/answer-keys` with usage subquery: < 100ms p95. Aggregation is a small group-by.
- No new external service calls. No LLM calls on either page.

## 8. Build sequence (informs the plan)

Suggested implementation order (the writing-plans skill will turn this
into discrete tasks):

1. **Hoist nav** — extract `TEACHER_TABS` / `PARENT_TABS` to `lib/nav.ts`; apply tabs to `/students` and `/students/[id]` (existing pages, no functional change).
2. **A11y fixes** — skip-to-content link in `AppShell`; focus-visible ring on `AppHeader` tabs.
3. **Backend: `/api/answer-keys` usage extension** — schema change + query + tests. Smaller of the two backend extensions, gets the pattern right.
4. **Backend: `/api/assessments` extension** — date filter, cursor, `has_key`, `headline_inputs`. Reuses `apply_reviews_to_problems` from Step 11a. Includes test coverage.
5. **Frontend: `/keys` library** — components, page, AddKeyDialog wiring. Smaller surface, lets us validate the page-shell + auth-gate pattern before hitting the bigger archive.
6. **Frontend: `/assessments` archive** — components, page, filters, load-more. Bigger surface; uses everything established in 1-5.
7. **Whole-branch review** — Opus pass before merging.

Each numbered step ships behind one or more commits on
`step-13a-archive-keys`. After step 7 passes, single PR opened via
`gh pr create`, squash-merged after user OK.

---

## Followups created from this spec

- `/keys/[id]` detail page — captured in followups.md ("Step 13a · Key detail page deferred").
- Pattern + Has-key archive filters — already in followups.md as "Archive filters · post-MVP".
- "Verified vs draft" key state — captured in followups.md as parser-confidence brainstorm.
- Items count per key — same.
