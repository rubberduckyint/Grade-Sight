# Step 11a · Inline correction — design

**Reference:** `docs/design/Grade Sight Handoff v2.html` §Implementation Step 11:
> STEP 11 · INLINE CORRECTION + VIEWER · Add teacher overrides & the side-by-side viewer.
> Inline panel slides in on the problem row, persists to `diagnostic_reviews`. `/assessments/[id]/viewer` renders the student's page next to the printed key, with the wrong line boxed.

The handoff doc lumps both surfaces together, but they are independent. **This spec covers Step 11a only**: backend `diagnostic_reviews` schema + router + service overlay, and the teacher-facing inline edit panel on `<ProblemRow>`. The side-by-side viewer (`/assessments/[id]/viewer`) is **Step 11b** and gets its own brainstorm and spec.

**Canvas:** `docs/design/Grade Sight Diagnosis v2.html` (rendered via `session4-diagnosis.jsx`) — `DiagnosisTeacher` mock, lines 332–423, shows the inline edit panel OPEN on problem #3.

**Branch:** `step-11a-inline-correction` (off Step 10's tip until Step 10 merges; then rebase onto main). **Mode:** v2 design step — branch + per-step PR.

## Why this exists as a step

Step 10 establishes the editorial diagnosis page; Step 11a is the first step that lets teachers act on it. The canvas's "Editing" column-transform pattern is one of the four core moves on the diagnosis page (the other three are top sentence, pattern groups, problem rows — all from Step 10). Without inline correction, the teacher mode is read-only. Step 11a closes that gap.

It is also the first step that introduces a teacher-only write surface in the v2 build. The patterns established here (org-scoped writes, audit logging, server-action persistence with `router.refresh()`, client-component conversion of editable rows) become the template for Step 11b's viewer interactions and Step 13's `/settings/privacy` controls.

## Discovery: schema, router, and overlay are net-new

The `diagnostic_reviews` table referenced in the handoff doc and Step 10's spec **does not exist** in the codebase today — no migration, no SQLAlchemy model, no FastAPI router, no pydantic schemas. The handoff doc gives a TypeScript-ish type signature but no SQL or Python implementation. Step 11a builds it from scratch.

Existing `<ProblemRow>` (Step 10) is a server component. Adding inline edit requires a client boundary. The cleanest decomposition (per Approach 1, locked below) is to convert `<ProblemRow>` to a client component with an internal edit-state machine, since edit interaction affects whole-row visual treatment (bg tint + columns 3+4 transform) and coordinating state across server/client boundaries adds more complexity than it saves.

The Step 10 helpers (`buildTopSentence`, `groupProblemsByPattern`) and components (`<TopSentence>`, `<PatternGroup>`, `<ProblemGrid>`) require **no logic changes**, because the API layer applies reviews server-side and returns EFFECTIVE `ProblemObservation` fields. The only Step 10 component that needs modification is `<ProblemGrid>` (✎ glyph + accent treatment for reviewed squares).

## Scope

- **In:** `diagnostic_reviews` table (alembic + SQLAlchemy model). Pydantic schemas. FastAPI router with POST/PATCH/DELETE under `/api/assessments/{id}/reviews`. Service overlay that applies reviews to `ProblemObservation` rows in the existing assessment-detail GET response. `<ProblemRow>` client conversion with edit-state machine. New `<EditPanel>` and `<PatternPicker>` components. New `<ReviewedSection>` for mark-correct rows that exit the pattern-groups area. Toast feedback via the Step 09 `notify` helper. Audit logging on every review write.
- **In:** Wire `error_patterns` into the page-level fetch so the picker has its options without a per-row request.
- **Out:** Side-by-side viewer (`/assessments/[id]/viewer`) — Step 11b.
- **Out:** Engine emission of bounding boxes for the wrong-line highlight in the viewer — Step 11b's design problem.
- **Out:** Edit on already-correct rows (auto-graded correct → teacher says wrong). Not in handoff schema; defer until a real use case appears.
- **Out:** Free-form `note` UI surface. Schema column ships nullable for forward compatibility, no UI.
- **Out:** Confirmation modal on Delete. Reviews are reversible; revisit if data shows accidental deletes.
- **Out:** Bulk edit, concurrency / staleness handling, re-run-changes-problem-numbers edge case, longitudinal review stats.

## Architecture

The page (`apps/web/app/assessments/[id]/page.tsx`) stays a server component. `<ProblemRow>` flips to `"use client"` because edit state coordinates whole-row visual treatment. Edit-related components (`<EditPanel>`, `<PatternPicker>`) are client. All other Step 10 components stay server-rendered.

Effective state at the API layer: `GET /api/assessments/{id}` overlays active reviews onto each `ProblemObservation` so the existing fields (`is_correct`, `error_pattern_slug`, `error_pattern_name`, `error_category_slug`) represent post-review truth. The `ProblemObservation.review` sub-object carries override metadata for display purposes (the edit panel reads from it, the bottom grid checks `review !== null` for ✎).

Server actions (`createReview`, `updateReview`, `deleteReview` in `apps/web/lib/actions/reviews.ts`) call the FastAPI endpoints with the user's Clerk token. After success, the action calls `router.refresh()` so the page re-fetches and re-renders with new effective state — no client-side state reconciliation.

## Components

| Path | Type | Responsibility |
|---|---|---|
| **Backend** | | |
| `apps/api/alembic/versions/<NEW>_add_diagnostic_reviews.py` | new migration | Creates `diagnostic_reviews` table per §Schema below. |
| `apps/api/src/grade_sight_api/models/diagnostic_review.py` | new model | SQLAlchemy ORM mapping. Relationships to `Assessment` and `ErrorPattern` (override). Soft-delete via `deleted_at`. |
| `apps/api/src/grade_sight_api/schemas/diagnostic_reviews.py` | new schemas | `DiagnosticReviewCreate`, `DiagnosticReviewUpdate`, `DiagnosticReviewOut`. Pydantic validators enforce mark-correct XOR override-pattern. |
| `apps/api/src/grade_sight_api/routers/diagnostic_reviews.py` | new router | Three endpoints: POST/PATCH/DELETE. Org-scoped auth. Audit logging on every write. |
| `apps/api/src/grade_sight_api/routers/error_patterns.py` | new router | `GET /api/error-patterns` returning the active pattern list. Read-only, authenticated, no org scoping (taxonomy is global). Used by the page-level fetch that feeds the picker. |
| `apps/api/src/grade_sight_api/schemas/error_patterns.py` | new schemas | `ErrorPatternOut` (`id`, `slug`, `name`, `category_slug`, `category_name`). |
| `apps/api/tests/routers/test_error_patterns_router.py` | new pytest | Auth (no token → 401, any authenticated user → 200), response shape, ordering by category then name. |
| `apps/api/src/grade_sight_api/services/diagnostic_review_service.py` | new service | `apply_reviews_to_problems(problems, reviews, pattern_index)` overlays reviews onto the auto-grade output. |
| `apps/api/src/grade_sight_api/main.py` | modify | Register the new router. |
| `apps/api/src/grade_sight_api/routers/assessments.py` | modify | `GET /api/assessments/{id}` eagerly loads active reviews + error-pattern dictionary, calls overlay before returning. |
| `apps/api/src/grade_sight_api/schemas/assessments.py` | modify | `ProblemObservation` gains `review: DiagnosticReviewOut \| None`. Existing fields' VALUES become effective post-review. |
| `apps/api/tests/models/test_diagnostic_review.py` | new pytest | Defaults, FKs, soft-delete + uniqueness invariant. |
| `apps/api/tests/services/test_diagnostic_review_service.py` | new pytest | Overlay across three review states (mark-correct, override-pattern, no review). |
| `apps/api/tests/routers/test_diagnostic_reviews_router.py` | new pytest | Full CRUD + auth (parent → 403, wrong org → 403, no token → 401) + validation (XOR rule, both-empty rule, unique constraint → 409) + audit-log assertions. |
| `apps/api/tests/routers/test_assessments_router.py` | modify | One additional test confirming review overlay flows through the GET response shape. |
| **Frontend** | | |
| `apps/web/lib/types.ts` | modify | Add `DiagnosticReview` type. Add `review: DiagnosticReview \| null` field to `ProblemObservation`. |
| `apps/web/lib/api.ts` | modify | Add `fetchErrorPatterns()` helper that returns the grouped pattern list (called from `page.tsx`). |
| `apps/web/lib/actions/reviews.ts` | new | Server actions: `createReview(assessmentId, payload)`, `updateReview(reviewId, payload)`, `deleteReview(reviewId)`. Each calls the FastAPI endpoint and returns the result. |
| `apps/web/components/diagnosis/problem-row.tsx` | rewrite to client | `"use client"`. Edit-state machine. Reads `role` and `editablePatterns` from props. Renders `<EditPanel>` in the editing slot. |
| `apps/web/components/diagnosis/edit-panel.tsx` | new (~120 lines) | The "EDITING THIS DIAGNOSIS" panel: pattern picker, mark-correct checkbox, Save/Cancel/Delete buttons. Validation per §Edit panel below. |
| `apps/web/components/diagnosis/pattern-picker.tsx` | new (~50 lines) | Wraps shadcn `<Select>` grouped by `category_slug` via `<SelectGroup>` + `<SelectLabel>`. Disabled when mark-correct is checked. |
| `apps/web/components/diagnosis/pattern-group.tsx` | modify | Threads `role` and `editablePatterns` props down to `<ProblemRow>`. No structural change. |
| `apps/web/components/diagnosis/problem-grid.tsx` | modify | When `problem.review !== null`: ✎ glyph, `border-accent`, `bg-accent-soft`. Updated `aria-label` reads `Problem N: reviewed by teacher`. |
| `apps/web/components/diagnosis/reviewed-section.tsx` | new (~80 lines) | Renders rows where `review !== null && is_correct === true` (mark-correct reviews). Mono-caps eyebrow `REVIEWED · MARKED CORRECT`. Each row reuses `<ProblemRow>` with subtle styling distinguishing it from a wrong-row context. |
| `apps/web/app/assessments/[id]/page.tsx` | modify | Server-fetch error patterns once, pass through `<CompletedBody>` → groups → rows. Render `<ReviewedSection>` between pattern groups and `<ProblemGrid>` when at least one mark-correct review exists. |
| `apps/web/components/diagnosis/__tests__/edit-panel.test.tsx` | new vitest | Render in three start states; assert validation rules; mock server action; assert mode transitions. |
| `apps/web/components/diagnosis/__tests__/problem-row.test.tsx` | new vitest | Role-aware Edit affordance, mode transitions, save flow with mocked server action. |

## Schema

`diagnostic_reviews` table:

```
id                     uuid pk
assessment_id          uuid not null, fk→assessments.id, indexed
problem_number         int  not null
original_pattern_id    uuid     null, fk→error_patterns.id  -- snapshot of auto-grade slug at time of review (informational; never updated by patches)
override_pattern_id    uuid     null, fk→error_patterns.id  -- null when marked_correct
marked_correct         bool not null default false
note                   text     null  -- schema-only in v1; no UI
reviewed_by            uuid not null, fk→users.id
reviewed_at            timestamptz not null default now()
created_at             timestamptz not null default now()
updated_at             timestamptz not null default now()
deleted_at             timestamptz null
```

Unique partial index: `unique (assessment_id, problem_number) where deleted_at is null` — at most one active review per (assessment, problem). Soft-delete + uniqueness compose via the `WHERE deleted_at IS NULL` clause.

## Pydantic schemas

```python
class DiagnosticReviewCreate(BaseModel):
    problem_number: int
    override_pattern_id: UUID | None = None
    marked_correct: bool = False
    note: str | None = None

    @model_validator(mode="after")
    def validate_one_action(self):
        if self.marked_correct and self.override_pattern_id:
            raise ValueError("Cannot both mark correct and override pattern")
        if not self.marked_correct and self.override_pattern_id is None:
            raise ValueError("Must either mark correct or set override pattern")
        return self


class DiagnosticReviewUpdate(BaseModel):
    override_pattern_id: UUID | None = None
    marked_correct: bool | None = None
    note: str | None = None
    # Router merges patch fields into existing record then re-runs the same XOR validator.


class DiagnosticReviewOut(BaseModel):
    id: UUID
    marked_correct: bool
    override_pattern_id: UUID | None    # needed by the picker for re-edit pre-selection
    override_pattern_slug: str | None
    override_pattern_name: str | None
    note: str | None
    reviewed_at: datetime
    reviewed_by_name: str               # joined display name from users table
```

## API surface

- `POST /api/assessments/{assessment_id}/reviews` → 201 + `DiagnosticReviewOut`. Verifies `current_user.organization_id == assessment.organization_id` (403 otherwise). Snapshots `original_pattern_id` from the matching `ProblemObservation`. Inserts review. Audit log: `action="diagnostic_review.create"`.
- `PATCH /api/assessments/{assessment_id}/reviews/{review_id}` → 200 + `DiagnosticReviewOut`. Same auth. Merges patch fields into the existing record; re-runs the XOR validator on the merged state. Audit log: `action="diagnostic_review.update"`.
- `DELETE /api/assessments/{assessment_id}/reviews/{review_id}` → 204. Sets `deleted_at`. Audit log: `action="diagnostic_review.delete"`.
- `GET /api/assessments/{id}` → existing endpoint, behavior expanded: eagerly loads active reviews + error-pattern dictionary, calls `apply_reviews_to_problems` before returning. `ProblemObservation` fields are effective; `review` sub-object included.
- `GET /api/error-patterns` → 200 + `list[ErrorPatternOut]`. Read-only; any authenticated user can call. No org scoping (taxonomy is shared infrastructure). Used by the page-level fetch that feeds the picker.

Authentication enforced by the existing Clerk-token middleware; authorization for review writes via the strict predicate below.

**Strict org-match predicate for writes:** `current_user.organization_id IS NOT NULL AND current_user.organization_id == assessment.organization_id`. Parents have a null `organization_id` and are denied even when the assessment is parent-uploaded — inline correction is teacher-only by design (the canvas only shows it in teacher mode).

## Service overlay

`apps/api/src/grade_sight_api/services/diagnostic_review_service.py` exposes a single pure function:

```python
def apply_reviews_to_problems(
    problems: list[ProblemObservationRow],
    reviews: list[DiagnosticReviewRow],
    pattern_index: dict[UUID, ErrorPatternRow],
) -> list[ProblemObservationOut]:
```

For each problem with a matching active review:
- If `review.marked_correct` → `is_correct = True`. Pattern fields unchanged. (The row still "belongs" to its pattern in history; effective correctness drives grouping/scoring.)
- If `review.override_pattern_id is not None` → rewrite `error_pattern_slug` / `error_pattern_name` / `error_category_slug` from the override pattern's row in `pattern_index`. `is_correct = False`.
- Always: populate `problem.review` with the `DiagnosticReviewOut` shape.

Problems with no matching review pass through unchanged with `review = None`.

## Frontend data flow & UX

### `<ProblemRow>` client conversion

```ts
type RowMode = "view" | "editing" | "saving";

interface RowState {
  mode: RowMode;
  selectedPatternId: string | null;
  markedCorrect: boolean;
}
```

Edit values (`selectedPatternId`, `markedCorrect`) live alongside `mode` rather than nested inside it, so they survive transitions through `"saving"` and are preserved if a save fails (the user's input is not lost).

Initial state derives from incoming `review`:
- No review → `{ mode: "view", selectedPatternId: null, markedCorrect: false }`. Editable rows show `Edit ›` link beneath `Steps ›` in the rightmost column.
- Existing review → same `mode: "view"`, but `selectedPatternId` and `markedCorrect` pre-loaded from `review.override_pattern_id` / `review.marked_correct` so re-editing opens the panel with the previous values pre-filled. Effective state on the row already drives the rest of the visible content.

**Editable-row predicate:** `role === "teacher" && (!problem.is_correct || problem.review !== null)`. Wrong rows AND any rows with an existing review get the affordance. Parents and `auto_grade` mode never see the link.

Click `Edit ›` → `setState({ mode: "editing", selectedPatternId, markedCorrect })`. Row bg tints `bg-accent-soft`. Column 3 transforms: instead of "What it should be" it renders `<EditPanel>`. Column 4 ("Steps ›") shows `EDITING…` mono-caps in `text-accent`.

### `<EditPanel>` content

```
EYEBROW (mono caps, text-accent):  EDITING THIS DIAGNOSIS

Pattern:                            (label)
[ <PatternPicker> shadcn Select,    (current = selectedPatternId)
  grouped by category, disabled
  when markedCorrect === true ]

[ ] Mark as actually correct        (checkbox; clears picker when checked)

[ Save ] [ Cancel ] [ Delete ]      (Delete only renders when re-editing
                                     an existing review)
```

### Validation rules (mirrors backend `model_validator`)

- Save disabled when `selectedPatternId === null && !markedCorrect` (no-op).
- Save disabled when `selectedPatternId !== null && markedCorrect` (UI-unreachable; defense-in-depth).
- Save enabled otherwise.

### Save flow

1. Click Save → `setState({ ...prev, mode: "saving" })`.
2. Call server action `createReview` (or `updateReview` for re-edits).
3. Action POSTs/PATCHes to the API with the user's Clerk token.
4. On success: `notify.success("Review saved")`, `router.refresh()`, `setState({ ...prev, mode: "view" })`.
5. On failure: `notify.error("Couldn't save review", { description: err.message })`, `setState({ ...prev, mode: "editing" })` — selectedPatternId and markedCorrect are preserved by being stored outside the mode state, so the user's input is not lost.

### Cancel

Reset to view mode with values restored from the latest `review` (or null/false if no review). No API call, no toast.

### Delete (only on re-edits)

1. Click Delete → no confirmation modal in v1 (reviews are reversible).
2. `setState({ ...prev, mode: "saving" })`.
3. Call `deleteReview(reviewId)`.
4. On success: `notify.success("Review removed")`, `router.refresh()`. Row reverts to its un-reviewed effective state.
5. On failure: notify error, return to editing mode with values preserved.

### Pattern picker

`<PatternPicker>` wraps shadcn `<Select>`. Loads patterns from `/api/error-patterns` once at the page level (server fetch in `page.tsx`); the array is threaded through `<CompletedBody>` → `<PatternGroup>` → `<ProblemRow>` → `<EditPanel>` → `<PatternPicker>`. Options grouped via `<SelectGroup>` + `<SelectLabel>` per `category_slug`. Selected value is the override pattern's UUID; rendered text is `pattern.name`. When `markedCorrect === true`, the Select is disabled and shows placeholder `Marked correct — no pattern`.

### `<ReviewedSection>`

Renders below pattern groups, above `<ProblemGrid>`. Filter: `problems.filter(p => p.review !== null && p.is_correct === true)`. Empty filter → component returns `null`.

```
┌─────────────────────────────────────────────────────────────┐
│  REVIEWED · MARKED CORRECT  (mono caps, text-accent)        │
│  Reviewed by teacher                                        │
│  ─────────────────────────────────────────────────────────  │
│  #11   their answer (Caveat)   Reviewed by Jane · today  Edit › │
│  #14   their answer (Caveat)   Reviewed by Jane · 2d ago Edit › │
└─────────────────────────────────────────────────────────────┘
```

Each row reuses `<ProblemRow>` with a `context?: "reviewed-section"` prop (default = "pattern-group"). When `context === "reviewed-section"` the row's eyebrow renders `REVIEWED · MARKED CORRECT` instead of pattern category text, the "What it should be" column shows `—`, and the row uses `text-ink-mute` for body copy. The edit machinery is identical, so clicking `Edit ›` opens the same `<EditPanel>` and supports pattern-change (which would convert the review from mark-correct to a pattern override) or Delete.

### `<ProblemGrid>` updates

When `problem.review !== null`:
- Border: `border-accent`.
- Background: `bg-accent-soft`.
- Glyph: `✎` in `text-accent`.
- `aria-label`: `Problem N: reviewed by teacher`.
- `href` jump-link kept; mark-correct rows now anchor to `<ReviewedSection>`, pattern-override rows anchor to their override `<PatternGroup>`.

### Toast feedback (Step 09 helpers)

- `notify.success("Review saved")` after create/update.
- `notify.success("Review removed")` after delete.
- `notify.error("Couldn't save review", { description })` on any failure.

### Components requiring NO change

`<TopSentence>`, `<PatternGroup>`, `buildTopSentence`, `groupProblemsByPattern`, `<HandwrittenWork>`, `<PrintedSolution>`. Effective state (locked Q3a) flows through transparently.

## Authorization

- Backend: strict predicate on every review write — `current_user.organization_id IS NOT NULL AND current_user.organization_id == assessment.organization_id`. Else 403. Parents have null `organization_id` and are denied even on parent-uploaded assessments.
- Reads of the assessment-detail GET inherit existing assessment-fetch authorization (already org-scoped or owner-scoped for parent uploads); the `review` sub-object on `ProblemObservation` is exposed to whoever can read the assessment.
- Frontend: edit affordance gated on `role === "teacher"`. Defense-in-depth — the backend is the authority.
- The `error_patterns` GET is open to any authenticated user. The taxonomy is global infrastructure, not student data.

## Audit logging

Per CLAUDE.md ("Student-data access logs to `audit_log`"). The router writes one `audit_log` row per create / update / delete using the existing service-layer pattern: `audit_log.write(actor_id=user.id, action="diagnostic_review.{create,update,delete}", subject_id=assessment.id, organization_id=assessment.organization_id, metadata={"review_id": str(review.id), "problem_number": ...})`.

## Error handling

- `DiagnosticReviewCreate` validator failure → 422 with the validator's message. Frontend toast: `Couldn't save review` + the message.
- Org mismatch → 403. Frontend toast: `You don't have permission to edit this assessment.`
- Unique constraint hit on duplicate (`assessment_id, problem_number`) → 409. Frontend should not hit this if the UI gates create vs. update correctly. Defensive toast: `A review already exists for this problem.`
- Network failure → frontend stays in editing mode, error toast.
- API 500 → error toast with the digest if available.

## Accessibility

- Edit affordance is a real `<button>` with mono-caps `Edit ›` text — keyboard-accessible, announced as "Edit, button".
- shadcn `<Select>` and `<Checkbox>` ship with their own keyboard + ARIA support.
- Save / Cancel / Delete are shadcn `<Button>`s with focus rings.
- ✎ glyph in problem grid is paired with `aria-label="Problem N: reviewed by teacher"` so screen readers don't read the glyph as art.
- Tinted row bg + accent-blue eyebrow + serif label are color cues; the eyebrow text "EDITING THIS DIAGNOSIS" carries the meaning so it isn't color-only.
- `prefers-reduced-motion`: column transform should be instant (no transition animation that re-flows on this preference).

## Testing

Backend (pytest):
- `tests/models/test_diagnostic_review.py` — defaults, FK constraints, soft-delete + uniqueness invariant verified by attempting duplicate active inserts.
- `tests/services/test_diagnostic_review_service.py` — `apply_reviews_to_problems` exhaustive: no-review pass-through; mark-correct flips `is_correct`; override-pattern rewrites slug/name/category; multiple reviews on different problems compose correctly; deleted reviews ignored.
- `tests/routers/test_diagnostic_reviews_router.py` — full CRUD; auth (parent → 403, teacher in wrong org → 403, no token → 401); validation (XOR, both-empty → 422; unique constraint hit → 409); audit-log writes verified.
- `tests/routers/test_assessments_router.py` — extend with one test confirming review overlay flows through the GET response shape.

Frontend (vitest + @testing-library/react):
- `components/diagnosis/__tests__/edit-panel.test.tsx` — render in three start states (no review / mark-correct review / pattern-override review). Assert: Save disabled when no change; Save enabled when pattern selected; Save enabled when mark-correct checked; checking mark-correct disables the picker; Delete only renders on re-edits; Cancel returns to view mode without API call.
- `components/diagnosis/__tests__/problem-row.test.tsx` — role-aware Edit affordance, mode transitions, save flow with mocked server action.

Repo gates:
- `pnpm --filter web typecheck` clean.
- `pnpm --filter web lint` clean.
- `pnpm --filter api typecheck` (mypy strict) clean.
- `pnpm --filter api test` clean (existing tests + new).
- `pnpm --filter web test` clean (existing + new).

Manual visual verification (dev server):
- Teacher × completed × wrong row → click Edit → panel opens in column 3, row tints accent-soft.
- Save with override pattern → row re-renders in new pattern's group; bottom grid shows ✎.
- Save with mark-correct → row exits pattern groups; appears in `<ReviewedSection>`; bottom grid shows ✎; pattern-group counts and top-sentence score recompute (effective state proof).
- Delete an existing review → row reverts; bottom grid shows ✗ again.
- Parent role × completed → no Edit affordance anywhere.
- 403 path: parent attempting POST via DevTools / curl → backend rejects.

## Verification checklist

- [ ] `diagnostic_reviews` table created; migration up-and-down clean; unique partial index on `(assessment_id, problem_number) WHERE deleted_at IS NULL`.
- [ ] Three router endpoints (POST/PATCH/DELETE) work end-to-end with org-scoped auth.
- [ ] `apply_reviews_to_problems` overlay matches the spec for all three review states.
- [ ] `GET /api/assessments/{id}` returns effective `ProblemObservation` fields with `review` sub-objects.
- [ ] `<ProblemRow>` is `"use client"` with the documented state machine.
- [ ] `<EditPanel>` exposes pattern picker + mark-correct, mutually exclusive, validates per spec; Delete renders only on re-edits.
- [ ] Pattern picker is shadcn `<Select>` grouped by category.
- [ ] `<ReviewedSection>` renders only when at least one mark-correct review exists.
- [ ] `<ProblemGrid>` shows ✎ for any reviewed problem.
- [ ] Toast feedback on save/delete/error via the Step 09 `notify` helper.
- [ ] Audit log writes one row per create/update/delete.
- [ ] All pytest targets pass; vitest passes; typecheck/lint clean for web and api.

## Out of scope (with assignment)

| Item | Owner |
|---|---|
| `/assessments/[id]/viewer` (side-by-side with key) | Step 11b |
| Engine emission of bounding boxes for "wrong line boxed" | Step 11b's design problem |
| Edit on already-correct rows | not in handoff schema; defer |
| Free-form `note` UI surface | schema-only v1; surface later |
| Confirmation modal on Delete | reviews reversible; revisit if data shows accidental deletes |
| Bulk-edit (apply same review to N rows) | future productivity feature |
| Concurrency / staleness handling | unlikely in MVP; add `updated_at` if-match later if it bites |
| Re-run that produces different `problem_number`s orphaning reviews | rare edge case; handle later |
| Longitudinal "this teacher reviewed N times this month" stats | Student Page biography territory |

## Seven-item checklist (handoff doc)

1. **Every font size is a token** — pass. Mono eyebrows `text-xs`; serif name `text-xl`; checkbox label `text-sm`; button labels `text-base`. No raw size values introduced.
2. **Every color is a token** — pass. `text-accent`, `text-ink`, `text-ink-soft`, `text-ink-mute`, `bg-accent-soft`, `border-accent`, `border-rule-soft`. No raw hex / oklch literals.
3. **Visible focus ring on every interactive element** — pass. shadcn `<Select>` and `<Checkbox>` use `:focus-visible`; Save/Cancel/Delete are shadcn `<Button>`s.
4. **Amber only at insight moments. Red only on `/error` ERR-XXX** — pass. Editing state uses accent-blue (canvas-consistent); no amber on editing affordances; no red anywhere.
5. **Body text is 18px. Nothing below 15px** — pass for body. Mono eyebrows `text-xs` (13px) consistent with Step 09/10 allowance.
6. **Serif = meaning, sans = doing** — pass. Pattern names in serif (consumed unchanged); checkbox labels and button text in sans; mono caps for eyebrows.
7. **Matches reference canvas** — pass. Inline edit panel matches `session4-diagnosis.jsx` `DiagnosisTeacher` lines 350–381 exactly: tinted row bg, accent-blue left border on column 3, accent eyebrow, pattern picker, mark-correct checkbox, Save/Cancel. Two deliberate v1 additions: Delete button (canvas didn't show re-edit cases) and `<ReviewedSection>` (architectural answer to "where do mark-correct rows go on the page"). Both are flagged in §Architecture.

## Locked decisions

- **Q1 decomposition:** Step 11 split into 11a (this spec — backend + inline edit) and 11b (viewer; separate brainstorm).
- **Q2 fields:** `override_pattern_id` + `marked_correct` + `note` in schema. UI v1 exposes pattern picker + mark-correct only.
- **Q3a effective state:** `ProblemObservation` fields represent EFFECTIVE post-review state.
- **Q3b review sub-object:** `review: DiagnosticReviewOut | null` carries override metadata for display.
- **Q3 endpoints:** unchanged GET, plus POST/PATCH/DELETE on `/api/assessments/{id}/reviews`.
- **Q4a auth:** org-scoped writes; parent users get 403.
- **Q4b editable rows:** wrong rows + any row with an existing review.
- **Q4c re-run:** reviews persist, keyed by `(assessment_id, problem_number)`.
- **Q5a picker UX:** shadcn `<Select>` grouped by category.
- **Q5b panel placement:** in-place column transform per canvas. Row bg tints; columns 3 and 4 transform; mark-correct disables the picker.
- **Approach:** Approach 1 — `<ProblemRow>` becomes a client component with internal state machine.
