# Diagnostic Engine v1 Design

> **Status:** Approved (2026-04-27).
> First feature spec to wire up Claude vision against student work. Lifts two CLAUDE.md gates: "Do not build diagnostic engine logic — taxonomy not finalized" (taxonomy IS finalized in Specs 7+8) and "Do not wire up Claude API calls — service layer stubs only" (service layer fully built in Spec 5; this is the first feature to consume it).

## Goal

Build the smallest end-to-end diagnostic engine that takes a multi-page assessment, calls Claude Sonnet 4.6 vision against all pages with the v1 taxonomy embedded as a (prompt-cached) system prompt, and returns per-problem **grade + error pattern + step-by-step solution**. All three outputs serve both audiences (teachers and parents). No answer key support in v1 — Spec 12 adds that for teacher accuracy.

## Why this spec exists

Pattern classification is Grade-Sight's product differentiator. Specs 1–10 built the upload, schema, and storage scaffolding; this spec turns that scaffolding into a diagnosing product. Two audiences benefit immediately:

- **Parents** get the full loop — engine grades, classifies, and provides a step-by-step solution. The "I don't remember Algebra 2 anymore" problem is solved by the engine's solution output.
- **Teachers** get a working tool with slightly lower grading accuracy (engine solves problems itself rather than comparing to a key). Pattern classification works regardless. Spec 12 adds the answer-key accuracy boost.

## Decisions

| Decision | Choice |
|---|---|
| Audience scope | Both — same engine flow, same UI, no audience-specific code in v1. |
| Answer key support | Deferred to Spec 12. Engine solves problems itself in v1. |
| Trigger pattern | Manual button on `/assessments/[id]` (status=`pending` → click → 30s sync wait → results). |
| Storage shape | Two relational tables: `assessment_diagnoses` (1:1 with Assessment) + `problem_observations` (N per diagnosis). |
| Model | Claude Sonnet 4.6 (single-model v1). |
| Calls per diagnosis | One vision call with all N pages + taxonomy in system prompt. |
| Prompt caching | Yes — taxonomy in system prompt, marked `cache_control: ephemeral`. |
| Image transport | Presigned R2 GET URLs passed to Claude (not base64 bytes). 10-minute expiry. |
| Output format | JSON parsed with Pydantic; engine returns slug, backend resolves to `error_pattern_id`. |
| Re-run | Disabled in v1 (UNIQUE constraint on `assessment_id`). Spec 12+ may add. |

## Schema

### `assessment_diagnoses` (1:1 with Assessment)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `assessment_id` | UUID FK → `assessments.id` | NOT NULL, **UNIQUE** (one diagnosis per assessment in v1) |
| `model` | text | e.g., `"claude-sonnet-4-6"` |
| `prompt_version` | text | e.g., `"v1"` — bucket results by prompt era |
| `tokens_input` | integer | NOT NULL |
| `tokens_output` | integer | NOT NULL |
| `tokens_cache_read` | integer | nullable — prompt-cache hits |
| `tokens_cache_creation` | integer | nullable — prompt-cache writes |
| `cost_usd` | numeric(10,6) | NOT NULL |
| `latency_ms` | integer | NOT NULL |
| `overall_summary` | text | nullable — Claude's optional aggregate insight |
| `organization_id` | UUID FK | from `TenantMixin` |
| `created_at`, `updated_at`, `deleted_at` | timestamps | |

### `problem_observations` (N per diagnosis)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `diagnosis_id` | UUID FK → `assessment_diagnoses.id` | NOT NULL, indexed |
| `problem_number` | integer | 1-indexed across the assessment (not per page) |
| `page_number` | integer | which page the problem appears on |
| `student_answer` | text | NOT NULL |
| `correct_answer` | text | NOT NULL — engine-derived |
| `is_correct` | boolean | NOT NULL |
| `error_pattern_id` | UUID FK → `error_patterns.id` | **nullable** — set only when wrong AND a slug matched |
| `error_description` | text | nullable — populated when wrong (even if no pattern matched) |
| `solution_steps` | text | nullable — populated when wrong |
| `organization_id` | UUID FK | |
| `created_at`, `updated_at`, `deleted_at` | timestamps | |

Unique constraint: `(diagnosis_id, problem_number)`. Index on `error_pattern_id` for cross-class pattern queries.

**What's intentionally NOT a column:**
- Score / percentage correct — derivable from `is_correct` aggregates.
- Per-problem `category_id` / `subcategory_id` — derivable via taxonomy joins on `error_pattern_id`.
- Confidence scores — Claude doesn't expose these reliably; deferred.

### `Assessment.status` transitions

The existing `assessment_status` enum (`pending`, `processing`, `completed`, `failed`) is unchanged. Engine uses it:
- `pending` → user clicks "Run diagnostic" → `processing` (Claude in flight) → `completed` on success / `failed` on error.

## Backend

### `claude_service.call_vision_multi` (extension)

Add a new function alongside the existing single-image `call_vision`:

```python
async def call_vision_multi(
    *,
    ctx: CallContext,
    model: str,
    system: str,
    images: list[bytes | str],   # bytes for base64, str for URL
    prompt: str,
    max_tokens: int,
    db: AsyncSession,
    cache_system: bool = False,
) -> ClaudeVisionResponse:
```

Builds a single user message with N image content blocks plus the prompt text. When `cache_system=True`, marks the system block with `cache_control: {"type": "ephemeral"}`. Audit + LLM-call-log + retry behavior identical to existing `call_vision`.

### `engine_service` (new module)

`apps/api/src/grade_sight_api/services/engine_service.py`. Public function:

```python
async def diagnose_assessment(
    *, assessment_id: UUID, user: User, db: AsyncSession,
) -> AssessmentDiagnosis:
```

Steps:
1. Load `Assessment` + `pages`. Verify same org as `user` (raise `HTTPException(403)` otherwise). 404 if missing.
2. Reject if `Assessment.status != pending` (raise 409).
3. Load taxonomy: all 4 categories + 16 subcategories + 29 patterns from DB (one query each, joined or selectinload).
4. Build the system prompt (see "System prompt" below) — taxonomy + instructions + JSON schema.
5. For each page: get a presigned GET URL via `storage_service.get_download_url` (10-min expiry).
6. Update `Assessment.status` to `processing`. Flush.
7. Call `claude_service.call_vision_multi(model="claude-sonnet-4-6", system=<built>, images=<urls>, prompt="Diagnose this assessment.", max_tokens=4096, cache_system=True, ctx=<contains_pii=True>, db=db)`.
8. Parse the response with a Pydantic `EngineOutput` model. On parse failure: set status `failed`, raise.
9. For each problem in output: if `error_pattern_slug` non-null, look up `error_pattern_id` by slug. Unknown slug → store NULL `error_pattern_id` but keep `error_description` and `solution_steps`.
10. Insert one `assessment_diagnoses` row + N `problem_observations` rows in the same transaction.
11. Update `Assessment.status` to `completed`. Flush.
12. Return the diagnosis ORM object (with relationships loaded for the response).

### Endpoint: `POST /api/assessments/{assessment_id}/diagnose`

In `routers/assessments.py`. Calls `engine_service.diagnose_assessment(...)`. Returns `AssessmentDiagnosisResponse`.

| Status | Condition |
|---|---|
| 200 | Success — returns full diagnosis |
| 403 | Cross-org |
| 404 | Assessment not found |
| 409 | Already diagnosed |
| 500 | Engine failure (Claude error, parse failure, R2 unreachable) |

### Extended `GET /api/assessments/{id}`

Response gains `diagnosis: AssessmentDiagnosisResponse | null`. Frontend reads diagnosis state from the detail GET — no separate fetch required for the detail page.

### System prompt

```
You are a math diagnostic assistant for Grade-Sight. You analyze handwritten
student math work and identify mistakes.

ERROR TAXONOMY:
The following error patterns are organized into 4 cognitive categories.
When you classify an error, use the slug exactly as written.

[INJECT FROM DB: for each category → its subcategories → leaf patterns,
 each with slug + name + description + distinguishing marker]

INSTRUCTIONS:
For each problem you find on the pages:
1. Identify the problem statement and the student's complete work and
   final answer.
2. Solve the problem yourself to determine the correct answer.
3. Compare. If the student's answer is wrong:
   a. Pick the best-matching error_pattern_slug from the taxonomy.
   b. Write a one-sentence error description.
   c. Provide a clear step-by-step solution.

OUTPUT FORMAT (return JSON only, no surrounding text):
{
  "overall_summary": "string | null (1-2 sentences highest-level takeaway)",
  "problems": [
    {
      "problem_number": int (1-indexed across all pages),
      "page_number": int,
      "student_answer": "string (the student's final answer)",
      "correct_answer": "string (the correct answer)",
      "is_correct": bool,
      "error_pattern_slug": "string | null (taxonomy slug if wrong; null if correct or no pattern fits)",
      "error_description": "string | null (1-sentence description if wrong; null if correct)",
      "solution_steps": "string | null (step-by-step solution if wrong; null if correct)"
    }
  ]
}
```

User message: `[image1, image2, ..., imageN, "Diagnose this assessment."]`. The system block is the only block marked `cache_control: ephemeral`.

### Pydantic schemas

In `schemas/assessments.py`:

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


# Extended:
class AssessmentDetailResponse(BaseModel):
    # ... existing fields ...
    diagnosis: AssessmentDiagnosisResponse | None
```

The `EngineOutput` Pydantic model used for parsing Claude's response lives inside `engine_service.py` (not exposed externally).

## Frontend

### Detail page layout (`/assessments/[id]`)

```
[Eyebrow: Assessment]
[Student name]                             [× Delete]
[Uploaded {time-ago} · {status badge} · {N pages}]

──────────────────────────────────────────────────
[ DIAGNOSTIC SECTION ]                          ← NEW
  status=pending:    "Run diagnostic" CTA card
  status=processing: animated "Analyzing… ~30s" panel
  status=completed:  <DiagnosisDisplay />
  status=failed:     error panel + "Try again" button
──────────────────────────────────────────────────

[ PAGES SECTION ]                               ← existing
  Page 1 image (full-size)
  Page 2 image
  ...
```

Diagnosis above pages — that's the new value. Pages stay below as reference.

### `RunDiagnosticButton` (new client component)

`apps/web/components/run-diagnostic-button.tsx`. Calls a new server action `runDiagnostic(id)` (in `lib/actions.ts`) which hits `POST /api/assessments/{id}/diagnose`. Uses `useTransition` for the 30-second wait — disabled state, "Diagnosing…" label. On success, `router.refresh()` so the server component re-fetches with the new diagnosis. On 500, shows an inline error and offers retry.

### `DiagnosisDisplay` (new server component)

`apps/web/components/diagnosis-display.tsx`. Renders the diagnosis. Server component — no client interactivity needed.

**Top section:**
```
[Eyebrow: Diagnostic results]
[Optional summary paragraph]
[Disclaimer: "Grade-Sight's analysis. Verify with your teacher if uncertain."]
```

The disclaimer is small grey text, always present in v1 — important since the engine derives correct answers itself (matters especially for parents).

**Per-problem card:**

For correct problems — header row only:
```
┌────────────────────────────────────────────┐
│ Problem 1 · Page 1            [✓ Correct]  │
│                                             │
│ Student's answer:  x = 7                   │
└────────────────────────────────────────────┘
```

For wrong problems:
```
┌─────────────────────────────────────────────┐
│ Problem 3 · Page 2             [✗ Wrong]    │
│                                              │
│ Student's answer:    x = 5  (struck through) │
│ Correct answer:      x = 7                  │
│                                              │
│ [Pattern badge: Execution · Sign error]     │
│ Distributed the negative sign incorrectly   │
│ across the parentheses.                     │
│                                              │
│ ▶ Show step-by-step solution                │
└─────────────────────────────────────────────┘
```

When `error_pattern_id IS NULL` (engine couldn't classify): no pattern badge, but description + solution still render. The expandable solution uses native `<details><summary>` for zero-JS interactivity.

### `runDiagnostic` server action

In `lib/actions.ts` (`"use server"` module). Hits the endpoint, throws on non-OK. Returns void; the server action triggers `router.refresh()` and the page re-renders with the new diagnosis flowing in via the existing `fetchAssessmentDetail` call.

### Type updates (`lib/types.ts`)

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

export interface AssessmentDetail {
  // ... existing fields ...
  diagnosis: AssessmentDiagnosis | null;
}
```

### Files changed (frontend)

- Modify `apps/web/lib/types.ts` (new types).
- Modify `apps/web/lib/actions.ts` (add `runDiagnostic`).
- Create `apps/web/components/run-diagnostic-button.tsx`.
- Create `apps/web/components/diagnosis-display.tsx`.
- Modify `apps/web/app/assessments/[id]/page.tsx` (insert diagnostic section, status-based branching).

## Error handling

### Backend

| Condition | HTTP | Behavior |
|---|---|---|
| Claude API error after retries | 500 | Status → `failed`. `ClaudeServiceError` already logged in `llm_call_logs`. |
| Claude returns malformed JSON | 500 | Status → `failed`. Raw response logged with the LLM call row. |
| Claude returns unknown `error_pattern_slug` | 200 | Store NULL `error_pattern_id`, keep description + solution. Not a failure. |
| R2 presigned URL generation fails | 500 | Status → `failed`. |
| Already diagnosed (status≠pending) | 409 | UI reads existing diagnosis via GET. |
| Cross-org assessment | 403 | |
| Assessment not found | 404 | |

### Frontend

- 30-second wait shows "Analyzing — about 30 seconds" panel.
- 500 response: inline error + retry button.
- Status=`failed` after refresh: same panel, same retry button.
- Retry path: re-call the endpoint (works because status=`failed` doesn't trigger 409).

### Re-run semantics

Explicitly out of scope for v1. UNIQUE constraint on `assessment_diagnoses.assessment_id` prevents a second diagnosis. Spec 12+ may add re-run.

### Cost runaway guard

None in v1. Cost tracked via `cost_usd` column + `llm_call_logs`. No hard caps. Phase-2 candidate.

## Testing

### Backend (~11 new tests)

**`engine_service` (8 tests):**
1. `test_diagnose_persists_diagnosis_and_observations` — happy path, mocked Claude returns 3-problem JSON, asserts rows + status transition + cost row + slug-resolved `error_pattern_id`.
2. `test_diagnose_resolves_pattern_slug` — mock returns valid slug, assert `error_pattern_id` matches the seeded pattern.
3. `test_diagnose_handles_unknown_slug` — mock returns `"made-up-slug"`, assert NULL `error_pattern_id`, description + solution retained.
4. `test_diagnose_marks_failed_on_claude_error` — mock raises `ClaudeServiceError`, assert `Assessment.status == failed`, no diagnosis row.
5. `test_diagnose_marks_failed_on_malformed_json` — mock returns `"not json"`, assert status=`failed`.
6. `test_diagnose_404_when_missing`.
7. `test_diagnose_403_cross_org`.
8. `test_diagnose_409_when_already_diagnosed`.

**Router endpoint (1 test):**
9. `test_post_diagnose_endpoint` — integration: dependency-overrides, mock Claude, POST, assert 200 + response shape.

**Extended GET detail (1 test):**
10. `test_detail_includes_diagnosis_when_completed` — extend the existing detail test: with diagnosis → response has `diagnosis: {...}`; without → `diagnosis: null`.

**`claude_service.call_vision_multi` (1 test):**
11. `test_call_vision_multi_with_cache_system_adds_cache_control` — patch `_get_session` (Spec 10 Task 2 pattern), send 2 images + `cache_system=True`, assert the underlying `messages.create` call had `cache_control` on the system block.

### Test fixtures

A new `seed_minimal_taxonomy` fixture in `tests/conftest.py` creates 1 category + 1 subcategory + 1 pattern with known slugs. Engine tests use this. Full production seed (4/16/29 rows) stays in `pnpm db:seed` for dev only.

### Frontend

No Vitest harness yet (still deferred since Spec 9). Manual smoke test on the implementation plan's final task:
1. Upload a 2-3 page math quiz.
2. On detail page: confirm "Run diagnostic" CTA card visible.
3. Click → loading state → ~30s wait.
4. Confirm diagnosis renders above pages: summary, per-problem cards with student answer, correct answer (where wrong), pattern badge, expandable solution.
5. Refresh page: diagnosis still there (persisted).
6. Click button again: 409 (or button hidden because status=`completed`).
7. Verify cost in DB: `select cost_usd from assessment_diagnoses` shows a real number.
8. Verify audit log: a `claude_vision_call` row exists for the engine call.

**Total backend test count post-spec:** ~58 (current) + 11 (new) ≈ 69 passed. Implementer should confirm actual baseline at start of work.

## Out of scope (deferred)

**Phase 2 / next-spec candidates:**
- **Answer key upload** (Spec 12) — optional teacher input, accuracy boost on hard subjects.
- **Auto-trigger on upload** — background task / queue, status polling.
- **Re-run diagnoses** — versioned `assessment_diagnoses` rows so a teacher can re-run with a newer prompt and compare. Requires lifting v1's UNIQUE constraint.
- **Partial credit semantics** — `is_correct: bool` becomes `score: float` + `partial_credit_reason`. For cases where a complex algebra problem is solved with the correct method but a small arithmetic slip (e.g., `3+2=4`) makes the final answer wrong; teachers typically award partial credit. Engine prompt + schema changes.
- **Mathpix integration** — cost reduction + math-OCR accuracy boost. Architecture leaves a clean transcribe step for swap-in.
- **Multi-call pipeline** — Sonnet for vision/reasoning, Haiku for output formatting. Cost win once volume justifies the complexity.
- **Per-page visual annotations** — overlay marks on the actual page images showing where errors are.
- **Cost rate limiting / spending caps** per teacher / org.
- **Confidence scores per observation** — engine self-reports how sure it is.
- **Eval set infrastructure** — still under the existing CLAUDE.md gate; comes after engine ships and we can build a regression suite.
- **Longitudinal student tracking views** — single-student-over-time error pattern dashboards.
- **Class/cohort-level summaries** — aggregate views for teachers.
- **Export / PDF download** of the diagnosis.
- **Frontend Vitest harness** — still chronically deferred since Spec 9.

## CLAUDE.md gate updates

When this spec ships, strike both gates from CLAUDE.md §5:
- "Do not build diagnostic engine logic — taxonomy not finalized" — taxonomy IS finalized (Specs 7+8); engine is now buildable.
- "Do not wire up Claude API calls — service layer stubs only" — service layer is fully built (Spec 5); this is the first feature wiring it up.

The remaining gates ("Do not implement eval set infrastructure", "Do not build batch upload, cohort pulse, admin dashboards, or LMS integrations") stay in place.
