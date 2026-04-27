# Answer Key + Engine Modes Design (Spec 12)

> **Status:** Approved (2026-04-27).
> Successor to Spec 11 (diagnostic engine v1). Adds optional answer-key support and two new engine modes (with-key, already-graded) plus wrong-only output. No new CLAUDE.md gates lifted (Spec 11 already lifted the engine + Claude API gates).

## Goal

Add optional **answer key** that the engine uses as ground truth for grading, plus a **wrong-only** output mode for graded papers (key OR teacher's red marks on the page) that produces only the failing-problem observations + a total-problems count. Three engine paths emerge: **auto-grade** (current Spec 11), **with-key** (teacher's primary path), **already-graded** (parent's primary path).

## Why this spec exists

Spec 11 brainstorm clarified that two improvements are essential before launch:
- **Teachers** upload **ungraded** student tests + their own answer key. Engine grades against the key.
- **Parents** upload **already-graded** tests their kid brought home. Engine reads the markings as ground truth.

Both flows benefit from wrong-only output: 4 wrong out of 18 problems means 70% smaller engine output (lower cost, lower latency) and a cleaner UI ("4 of 18 need review" rather than 18 cards including 14 rote-correct ones).

**Pattern identification stays load-bearing in every mode** — the differentiator for both audiences. Wrong-only doesn't hide patterns; it just skips correct-problem observations.

## Decisions

| Decision | Choice |
|---|---|
| Scope | All three modes (auto-grade, with-key, already-graded) bundled in Spec 12. |
| Answer key data shape | Multi-page (mirror of Spec 10's `assessment_pages`) — new `answer_key_pages` table. |
| Mode UI | Derive from two simple inputs (key picker + "already graded" checkbox). No explicit mode selector. |
| Wrong-only output | Engine returns only wrong observations + a `total_problems_seen` count. DB stores only wrongs. |
| Answer key management | Inline picker on `/upload` with × delete; no standalone `/answer-keys` page in v1. |
| Mode resolution when both signals are set | `with_key` wins (key is more reliable than markings detection). |
| `review_all` default | False (wrong-only is the v1 default for graded modes). User-checkable override on upload. |
| Default UI prominence | By user role: teacher → key picker prominent; parent → "already graded" prominent. Both visible. |

## Schema

**Refactor existing `answer_keys` table:**
- Drop `s3_url` (replaced by per-page rows).
- Drop unused `content: JSONB` (legacy, never wired up).
- Keep: `id`, `uploaded_by_user_id`, `name`, `organization_id`, timestamps, `deleted_at`.

**New `answer_key_pages` table** (1:N from AnswerKey, mirrors `assessment_pages`):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `answer_key_id` | UUID FK → `answer_keys.id` | NOT NULL, indexed, ondelete RESTRICT |
| `page_number` | integer | NOT NULL, 1-indexed |
| `s3_url` | text | NOT NULL — R2 key |
| `original_filename` | text | NOT NULL |
| `content_type` | text | NOT NULL |
| `organization_id` | UUID FK | from `TenantMixin` |
| `created_at`, `updated_at`, `deleted_at` | timestamps | |

Unique constraint on `(answer_key_id, page_number)`. Index on `answer_key_id`.

**Changes to `assessments` table:**
- `answer_key_id` (already exists, nullable FK from Spec 2 — keep, finally wired up).
- **NEW** `already_graded: bool` (default false) — teacher / parent flag.
- **NEW** `review_all: bool` (default false) — explicit opt-in to full output when grading source is available. Ignored in `auto_grade` mode (engine always returns all).

**Changes to `assessment_diagnoses` table:**
- **NEW** `total_problems_seen: int | null` — engine reports the page-wide problem count when wrong-only mode runs. Lets the UI show "4 of 18 need review" without storing 14 rote-correct observation rows.
- **NEW** `analysis_mode: str` — `"auto_grade"`, `"with_key"`, or `"already_graded"`. Persisted on every diagnosis for retrospective analysis.

**Engine mode derivation (no separate mode column on Assessment):**

```
if answer_key_id is set         → "with_key"
elif already_graded is true     → "already_graded"
else                            → "auto_grade"
```

**Migration:**
1. Create `answer_key_pages` table with constraints + indexes.
2. Drop `answer_keys.s3_url` and `answer_keys.content`. (Empty in dev — Spec 2 created the table but nothing uses it yet, so no backfill needed.)
3. Add `assessments.already_graded` and `assessments.review_all` (both default false).
4. Add `assessment_diagnoses.total_problems_seen` (nullable, existing rows stay null).
5. Add `assessment_diagnoses.analysis_mode` (NOT NULL with default `"auto_grade"`; backfill existing rows).

## Backend

### AnswerKey CRUD endpoints (new router `routers/answer_keys.py`)

Mirrors `routers/assessments.py` from Spec 10, parameterized for keys.

**`POST /api/answer-keys`** — request: `{name: str, files: [{filename, content_type}, ...]}`. Creates AnswerKey + N AnswerKeyPage rows in one tx. Returns `{answer_key_id, pages: [{page_number, key, upload_url}, ...]}`. Validates `1 ≤ len(files) ≤ 20`, `image/*` content types, non-empty filenames + name.

**`GET /api/answer-keys?limit=N`** — returns teacher's keys, ordered by `created_at DESC`. Per item: `{id, name, page_count, first_page_thumbnail_url, created_at}`. One presigned GET per row for the thumbnail.

**`GET /api/answer-keys/{id}`** — full detail with all pages (presigned GET URLs).

**`DELETE /api/answer-keys/{id}`** — soft-delete (`deleted_at`). Existing assessments referencing the deleted key still resolve through the FK (engine doesn't filter on the key's `deleted_at`). Picker filters out deleted keys for new uploads.

R2 key shape: `answer-keys/{org_id}/{answer_key_id}/page-{nnn}.{ext}` — no PII in keys.

All endpoints tenant-scoped. Standard 403/404 patterns from Spec 10.

### Assessment endpoint updates

**`POST /api/assessments`** request gains three optional fields:
```json
{
  "student_id": "<uuid>",
  "files": [...],
  "answer_key_id": "<uuid> | null",
  "already_graded": false,
  "review_all": false
}
```
Backend validates the answer key (exists + same org) if provided; stores on Assessment row.

**`POST /api/assessments/{id}/diagnose`** — endpoint shape unchanged; `engine_service.diagnose_assessment` reads the new fields and dispatches.

**`GET /api/assessments/{id}`** response gains `answer_key: AnswerKeySummary | null` (denormalized so the detail page can show "Diagnosed against [Quiz 1 Answer Key]"). Diagnosis response gains `analysis_mode` and `total_problems_seen`.

### `engine_service` updates

**Mode derivation** at the top of `diagnose_assessment`:

```python
if assessment.answer_key_id is not None:
    mode = "with_key"
elif assessment.already_graded:
    mode = "already_graded"
else:
    mode = "auto_grade"

wrong_only = (mode != "auto_grade") and (not assessment.review_all)
```

Three prompt variants in `_build_system_prompt(mode, wrong_only, key_page_count)` — same taxonomy injection (still cached), different instruction blocks.

**Auto-grade prompt** (current Spec 11 — unchanged):

> "For each problem you find on the pages: 1. Identify problem statement and student's work + final answer. 2. Solve the problem yourself to determine the correct answer. 3. Compare. If wrong: classify against taxonomy + provide solution. Output ALL problems with `is_correct` flag."

**With-key prompt:**

> "The first N images are STUDENT WORK pages (1-N). The next M images are the ANSWER KEY pages (1-M). For each problem on the student pages: 1. Find the matching problem on the answer key. 2. Compare student's answer to the key's answer. 3. If wrong: classify against taxonomy + provide solution.
>
> [If wrong_only=true:] Output ONLY problems where the student got it wrong. Also report `total_problems_seen` as the count of problems you saw across all student pages, including the correct ones you skipped.
>
> [If wrong_only=false:] Output all problems with `is_correct` flag."

**Already-graded prompt:**

> "The pages show student work that has been GRADED BY THE TEACHER. Look for: red X marks, crossed-out answers, score deductions, '-N points' notations, comments like 'wrong' or 'incorrect' near a problem.
>
> For each problem the teacher marked WRONG: 1. Identify problem statement and student's work. 2. Determine the correct answer. 3. Classify the error against taxonomy + provide solution.
>
> [If wrong_only=true:] Output ONLY problems the teacher marked wrong. Also report `total_problems_seen` as the count of problems you saw across all pages.
>
> [If wrong_only=false:] Output all problems with `is_correct` set based on the teacher's markings."

**Image list assembly** for `with_key` mode: `images = [student_pages..., key_pages...]`. The prompt's text describes the layout so Claude knows which images are which.

The diagnosis row gets `analysis_mode` stamped + `total_problems_seen` populated when wrong-only ran. `_EngineOutput` Pydantic model gains an optional `total_problems_seen: int | None` field.

## Frontend

### Files

| File | Action | Purpose |
|---|---|---|
| `apps/web/lib/types.ts` | modify | add AnswerKey types, extend AssessmentDetail |
| `apps/web/lib/actions.ts` | modify | add `createAnswerKeyForUpload`, `deleteAnswerKey`; extend `createAssessmentForUpload` |
| `apps/web/lib/api.ts` | modify | add `fetchAnswerKeys` |
| `apps/web/components/answer-key-upload-form.tsx` | create | drop-zone + multi-file (mirror of AssessmentUploadForm) |
| `apps/web/components/answer-key-picker.tsx` | create | inline picker (mirror of StudentPicker pattern) |
| `apps/web/components/assessment-upload-form.tsx` | modify | wire in key picker + "already graded" checkbox + "review all" checkbox |
| `apps/web/app/upload/page.tsx` | modify | server-fetch existing answer keys, pass to form |
| `apps/web/app/assessments/[id]/page.tsx` | modify | show mode + "X of Y problems" framing |
| `apps/web/components/diagnosis-display.tsx` | modify | render `total_problems_seen` framing |

### `AnswerKeyUploadForm` (new client component)

Direct mirror of `assessment-upload-form.tsx`, parameterized for keys:
- Top: `<input>` for key name (required, e.g., "Algebra 1 Chapter 7 Quiz Key")
- A note above the form: "Uploading an answer key noticeably improves grading accuracy. Recommended whenever you have one."
- Drop zone + multi-file picker (accept `image/*`, max 10 MB each, max 20 pages)
- Staged grid with × remove
- Submit calls `createAnswerKeyForUpload({name, files: [...]})`, parallel PUT to R2 (concurrency 4, 2 retries)
- On success, calls an `onCreated(answerKey)` prop so the parent picker can immediately select the new key
- Reuses the `runWithConcurrency` helper from Spec 10

### `AnswerKeyPicker` (new client component)

Inline picker on `/upload`. Initial render shows the current selection or a "(none — recommended for accuracy)" placeholder. Click expands to:
- Search input ("Search answer keys…")
- List of teacher's keys: 64×64 thumbnail + name + page count + small × delete button per row
- "+ Upload new key" at the bottom that expands inline to render `AnswerKeyUploadForm`
- "(none)" option to clear selection

Inline delete uses a confirm dialog (reuses the `DeleteAssessmentButton` pattern). Calls `deleteAnswerKey(id)`. On success the row disappears.

### Modified `AssessmentUploadForm`

Form layout (top to bottom):

```
[StudentPicker]                              ← unchanged

[Answer key (optional, recommended)]         ← NEW (de-emphasized for parent)
  └ AnswerKeyPicker

[Drop zone for quiz pages]                   ← unchanged

☐ This paper is already graded by the teacher  ← NEW (de-emphasized for teacher)

  ☐ Review all problems (skip wrong-only)    ← only visible when key or graded checked

[Submit]                                     ← label adjusts to selected count
```

Field prominence flips by `user.role`:
- **Teacher:** answer key section gets `mt-6` headline + visible by default; "already graded" checkbox is small, below the file picker.
- **Parent:** "already graded" checkbox is the prominent control; answer key section gets a quieter `mt-3` heading.

No fields are hidden — just visual de-emphasis (font weight, top margin). Keeps the form linear and single-page.

`createAssessmentForUpload` call extended to pass the new fields.

### Modified `/assessments/[id]` detail page

The existing eyebrow line currently reads:
> Uploaded {time-ago} · {status badge} · {N pages}

After Spec 12, when the diagnosis exists:
> Uploaded {time-ago} · {status badge} · {N pages} · **{Mode badge}**

Where mode badge is one of:
- `Auto-graded` (no key, no markings)
- `Graded with [Key Name]` (with-key mode)
- `Reading teacher markings` (already-graded mode)

When `total_problems_seen` is set on the diagnosis (wrong-only mode ran), the diagnosis section's eyebrow changes from "Diagnostic results" to "**4 of 18** problems need review" (or similar phrasing).

### `lib/types.ts` additions

```ts
export interface AnswerKey {
  id: string;
  name: string;
  page_count: number;
  first_page_thumbnail_url: string;
  created_at: string;
}

export interface AnswerKeyDetail extends AnswerKey {
  pages: { page_number: number; original_filename: string; view_url: string }[];
}

export interface AnswerKeyUploadIntent {
  answer_key_id: string;
  pages: { page_number: number; key: string; upload_url: string }[];
}
```

`AssessmentDetail` extended:
```ts
diagnosis: AssessmentDiagnosis | null;  // gains analysis_mode + total_problems_seen
answer_key: AnswerKey | null;           // NEW — denormalized
```

`AssessmentDiagnosis` extended:
```ts
analysis_mode: "auto_grade" | "with_key" | "already_graded";
total_problems_seen: number | null;
```

### Server actions (`lib/actions.ts`)

```ts
export async function createAnswerKeyForUpload(input: {
  name: string;
  files: { filename: string; content_type: string }[];
}): Promise<AnswerKeyUploadIntent>;

export async function deleteAnswerKey(id: string): Promise<void>;

// Extended:
export async function createAssessmentForUpload(input: {
  student_id: string;
  files: { filename: string; content_type: string }[];
  answer_key_id?: string;
  already_graded?: boolean;
  review_all?: boolean;
}): Promise<AssessmentUploadIntent>;
```

### Server-side fetcher (`lib/api.ts`)

```ts
export async function fetchAnswerKeys(): Promise<AnswerKey[]>;
```

Used by `/upload`'s server component to pre-populate the picker.

## Data flow

**Answer key creation (teacher's first time):**

```
Teacher                     Frontend                  Backend                    R2
opens /upload  ──────────►  AnswerKeyPicker shows
                            empty list + "Upload new"
clicks "+ Upload new" ────► picker expands
                            AnswerKeyUploadForm
fills name + drops 3 ────► drop-zone validates + sorts
PNGs                        thumbnails appear
clicks Upload ────────────► createAnswerKeyForUpload  POST /api/answer-keys
                                                      tx: AnswerKey + 3 pages
                                                      3x get_upload_url
                                                    ◄ {answer_key_id, pages: [3]}
                            parallel PUT x3 ────────────────────────────────────► R2
all 3 ok ──────────────────► onCreated(newKey)
                            picker auto-selects new key
                            AnswerKeyUploadForm collapses
```

**Assessment upload with answer key (Flow B):** standard upload flow plus the `answer_key_id` in the POST body. Backend stores the FK on the Assessment row.

**Diagnose flow with `with_key` + `wrong_only`:**

```
User clicks  ► RunDiagnosticButton  POST /api/assessments/<id>/diagnose
"Run                                engine_service.diagnose_assessment:
diagnostic"                          1. Load assessment + 5 student pages
                                     2. Detect mode: answer_key_id set → "with_key"
                                     3. Load AnswerKey + 3 key pages
                                     4. Build prompt for with_key + wrong_only
                                     5. Generate 5+3 = 8 presigned R2 GETs
                                     6. Status: pending → processing
                                     7. claude_service.call_vision_multi(
                                          system=<prompt cached>, images=[8 URLs])
                                     8. ~30s wait, parse JSON
                                     9. Output: {total_problems_seen: 18,
                                                 problems: [4 wrong ones]}
                                     10. Persist diagnosis (analysis_mode=
                                         "with_key", total=18) + 4 observations
                                     11. Status → completed
                            ◄────── return AssessmentDiagnosisResponse
               router.refresh()
               detail page re-renders with mode badge + "4 of 18 problems need review"
```

**Diagnose flow with `already_graded` + `wrong_only`:** same as above but no answer key pages — only the 5 student pages get sent to Claude. Prompt instructs Claude to read the teacher's markings on the student pages.

**Answer key delete flow:** soft-delete; picker filters out deleted keys for new uploads; existing assessments still resolve through FK.

**Audit log volume per diagnose call:**
- N student-page presigned GETs (`storage_object` audit rows)
- M key-page presigned GETs (only in `with_key` mode)
- 1 vision call audit row (`claude_vision_multi_call`)

**Cost note:** in `with_key` + wrong-only on a 5-page quiz with 3-page key + 18 problems, 4 wrong, output drops from ~5,400 to ~1,200 tokens — roughly 3x cost reduction on a hot-cache call.

## Error handling

### Backend

| Condition | HTTP | Behavior |
|---|---|---|
| AnswerKey: empty `files`, > 20 files, non-image, empty name | 400 | Specific `detail` per case |
| AnswerKey: cross-org GET / DELETE | 403 | |
| AnswerKey: not found | 404 | |
| Assessment: cross-org `answer_key_id` | 403 | "answer key does not belong to your organization" |
| Assessment: missing `answer_key_id` | 404 | "answer key not found" |
| Diagnose: `with_key` mode, key has no pages | 500 | Status → failed |
| Diagnose: `with_key` mode, key was deleted post-attach | 200 | Engine resolves the FK regardless of `deleted_at`; key pages still load |
| Diagnose: `already_graded` mode, engine returns empty `problems` array | 200 | Stored as a diagnosis with 0 observations + `total_problems_seen` set; UI shows "0 of N problems marked wrong" |
| Existing Spec 11 paths (Claude error, malformed JSON, 404, 403, 409) | unchanged | |

### Frontend

- AnswerKey upload PUT failures: same 2-attempt retry pattern as Spec 10's assessment upload.
- Failed `deleteAnswerKey`: toast "Could not delete — please try again."
- Empty key picker: shows "(none — recommended for accuracy)" + "+ Upload new key" affordance.
- Mode-derivation conflicts (both signals set): no client-side warning; detail page mode badge will read "Graded with [Key Name]" so the teacher sees which signal won.

### Re-run / re-diagnose semantics

Unchanged from Spec 11. An assessment can be diagnosed once. Wrong key attached → delete + re-upload.

## Testing

### Backend (~17 new tests)

**`POST /api/answer-keys` (5 tests):**
1. `test_create_persists_answer_key_and_pages` — happy path 3 files; AnswerKey + 3 AnswerKeyPage rows + correct R2 key shape + 3 audit rows.
2. `test_create_rejects_empty_files`.
3. `test_create_rejects_too_many_files` (21).
4. `test_create_rejects_non_image`.
5. `test_create_rejects_empty_name`.

**`GET /api/answer-keys` (1 test):**
6. `test_list_returns_keys_for_org_with_thumbnails` — tenant scoping, presigned thumbnail URL on each row, page_count correct.

**`GET /api/answer-keys/{id}` (3 tests):**
7. `test_detail_returns_pages_in_order`.
8. `test_detail_404_when_missing`.
9. `test_detail_403_cross_org`.

**`DELETE /api/answer-keys/{id}` (3 tests):**
10. `test_delete_soft_deletes_key`.
11. `test_delete_404_when_missing`.
12. `test_delete_403_cross_org`.

**Assessment endpoint extension (2 tests):**
13. `test_create_assessment_stores_answer_key_id_and_flags`.
14. `test_create_assessment_rejects_cross_org_answer_key`.

**`engine_service` mode tests (3 tests):**
15. `test_diagnose_with_key_mode_includes_key_images_in_call` — mock `call_vision_multi`, assert `images` arg has student pages followed by key pages; assert system prompt mentions "answer key"; assert `analysis_mode="with_key"` stamped on diagnosis.
16. `test_diagnose_already_graded_mode_uses_markings_prompt` — assert prompt mentions red X's / score deductions; `analysis_mode="already_graded"`.
17. `test_diagnose_wrong_only_stores_only_wrong_observations_with_total_count` — engine returns 4 wrong out of 18; assert 4 ProblemObservation rows persisted, `total_problems_seen=18` on the diagnosis row.

### Migration test

Verify the data-migration backfills existing `assessment_diagnoses.analysis_mode` to `"auto_grade"` for legacy rows.

### Test fixtures

New `seed_answer_key` fixture in `conftest.py` creates a 2-page AnswerKey for a given org/user.

### Frontend manual smoke (Task 9 of plan)

1. Upload an answer key (2-3 pages, name it).
2. Upload an assessment with key — confirm mode badge "Graded with [name]".
3. Run diagnostic in `with_key` mode — verify "X of 18 problems need review" + only wrong observations.
4. Run a parent-flow assessment — no key, check "Already graded by teacher".
5. Run diagnostic in `already_graded` mode — confirm engine identifies marked-wrong problems.
6. Test `Review all` override — assert all problems return.
7. Delete an answer key — confirm picker filters out deleted; old assessment with that key still renders.
8. Smart-default placement: teacher → key picker prominent; parent → "already graded" prominent.

**Total backend test count post-spec:** ~73 (current) + ~17 (new) ≈ 90 passed.

## Out of scope (deferred)

**Phase 2 / next-spec candidates:**
- Standalone `/answer-keys` management page.
- Re-diagnose with a different key (requires lifting UNIQUE constraint on `assessment_diagnoses.assessment_id`).
- Renaming answer keys.
- Structured (text / JSONB) answer keys.
- Class-level answer keys (attach to Klass, inherit on assessments).
- Auto-derive grading from teacher markings without a flag.
- **Printable corrections PDF** (Spec 13 candidate, teacher-launch requirement).
- Wrong-only-without-key for AUTO mode (cost win evaporates; engine grades anyway).
- Re-attaching a deleted key (no undelete UI in v1).

**Carried forward from Spec 11's deferred list:**
- Auto-trigger on upload.
- Re-run diagnoses (versioned diagnoses).
- Partial-credit semantics.
- Mathpix integration.
- Multi-call pipeline (Sonnet + Haiku).
- Per-page visual annotations.
- Cost rate limiting / spending caps.
- Confidence scores per observation.
- Eval set infrastructure.
- Longitudinal student tracking.
- Class/cohort-level summaries.
- Frontend Vitest harness.
- **Intervention plans (CHEC-style)** — gated on the math-educator hire per the product framing memo.

## CLAUDE.md gates

No gates lifted by this spec. Spec 11 already lifted the engine + Claude API gates. Remaining gates ("eval set", "batch upload / cohort pulse / admin / LMS") stay in place.
