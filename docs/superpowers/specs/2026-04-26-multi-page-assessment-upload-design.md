# Multi-Page Assessment Upload Design

> **Status:** Approved (2026-04-26).
> Successor to Spec 9 (single-file upload). Predecessor to the diagnostic engine spec.

## Goal

Turn "1 assessment = 1 file" into "1 assessment = N pages" so a teacher can upload all the scanned sheets of a quiz in a single shot. Add drag-and-drop and multi-select on the upload form, image thumbnails on the dashboard recent list, a per-assessment detail view, and a delete button for wrong uploads.

## Why this spec exists

Spec 9's smoke test surfaced the canonical case: a graded quiz is rarely one page. The user's daughter's quiz was 5 PNGs that had to be uploaded one at a time. Single-file upload will feel broken every time a teacher uses Grade-Sight. Multi-page upload also defines the schema shape the diagnostic engine will read from, so getting it right before the engine spec saves rework.

## Architecture

One new DB table (`assessment_pages`), one Alembic migration that backfills from the existing `Assessment.s3_url`, then a one-shot POST that creates the assessment plus all pages in a single transaction and returns N presigned PUT URLs. Browser stages files in a drop-zone form, parallel-uploads to R2 (max 4 concurrent), redirects to a new `/assessments/[id]` detail page on success. Dashboard recent list grows a first-page thumbnail plus a page-count badge per row. Both the dashboard and the detail page render images via short-lived presigned GET URLs generated server-side.

No changes to auth, billing, taxonomy, or `storage_service` beyond using its existing `get_upload_url` and `get_download_url` helpers.

## Decisions

| Decision | Choice |
|---|---|
| Scope | Multi-page only. Batch (multi-assessment in one session) deferred. |
| Schema | New `assessment_pages` table (1:N from Assessment). |
| Page ordering | Sort selected files alphabetically by filename on the client. |
| Add pages after submit? | No — page list is locked at creation. |
| Thumbnail strategy | Presigned GET URLs, ~1 hour expiry, generated server-side per render. |
| Detail view | New `/assessments/[id]` server-component page. |
| File types | Image only (`image/*`). PDF is a separate spec. |
| Max pages per assessment | 20. |
| Max size per file | 10 MB (same as Spec 9). |
| Max total per assessment | ~150 MB (loose; client gates the sum). |
| Concurrency | Parallel PUT to R2 with max 4 in flight. |
| Approach | Pessimistic single-shot — one POST returns N URLs, browser PUTs all, redirects on success. |
| Assessment-level delete | Yes — `DELETE /api/assessments/{id}` (soft delete). |
| Page-level edit | No (deferred). |
| Drag-to-reorder pages | No (deferred). |

## Schema changes

**New table `assessment_pages`:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `assessment_id` | UUID, FK → `assessments.id` | NOT NULL, indexed |
| `page_number` | integer | NOT NULL, 1-indexed |
| `s3_url` | text | NOT NULL — the R2 key |
| `original_filename` | text | NOT NULL |
| `content_type` | text | NOT NULL |
| `organization_id` | UUID FK | from `TenantMixin` |
| `created_at`, `updated_at`, `deleted_at` | timestamps | from existing mixins |

Unique constraint: `(assessment_id, page_number)`.

**Changes to `assessments` table:**
- Drop `s3_url` (now lives per-page).
- Drop `original_filename` (each page has its own).
- Keep `status`, `student_id`, `class_id`, `answer_key_id`, `uploaded_by_user_id`, `uploaded_at`, the timestamps, and the org.

**Alembic migration:**
1. Create `assessment_pages` table with the constraints and an index on `assessment_id`.
2. For each existing `assessments` row where `s3_url IS NOT NULL`: insert one `assessment_pages` row with `page_number=1`, copying `s3_url`, `original_filename`, `organization_id`, and using `'image/png'` as the placeholder `content_type` for legacy rows.
3. Drop `s3_url` and `original_filename` from `assessments`.

**SQLAlchemy:**
- New `AssessmentPage` model in `apps/api/src/grade_sight_api/models/assessment_page.py`.
- `Assessment.pages: Mapped[list[AssessmentPage]]` relationship, ordered by `page_number`.

## Backend endpoints

All on `routers/assessments.py`. All tenant-scoped via `user.organization_id`. All log via `storage_service` which writes to `audit_log`.

### `POST /api/assessments` (changed shape)

**Request:**

```json
{
  "student_id": "<uuid>",
  "files": [
    {"filename": "page-1.png", "content_type": "image/png"},
    {"filename": "page-2.png", "content_type": "image/png"}
  ]
}
```

**Response (201):**

```json
{
  "assessment_id": "<uuid>",
  "pages": [
    {"page_number": 1, "key": "...", "upload_url": "https://..."},
    {"page_number": 2, "key": "...", "upload_url": "https://..."}
  ]
}
```

**Validation:**
- `1 ≤ len(files) ≤ 20`
- Each `content_type` starts with `image/`
- Each `filename` non-empty after `.strip()` (filename gets stripped before persistence — same pattern as `routers/students.py`)
- Student exists and belongs to user's org (404 / 403 respectively)

**Behavior:** single transaction creates the Assessment row plus N `assessment_pages` rows. R2 key shape: `assessments/{org_id}/{student_id}/{assessment_id}/page-{nnn}.{ext}` where `nnn` is the zero-padded 3-digit page number. One `storage_service.get_upload_url` call per page, each writing a `presigned_upload_issued` audit_log row.

### `GET /api/assessments?limit=N` (changed shape)

**Response per item:**

```json
{
  "id": "<uuid>",
  "student_id": "<uuid>",
  "student_name": "...",
  "page_count": 5,
  "first_page_thumbnail_url": "https://...presigned GET, 1h expiry",
  "status": "pending",
  "uploaded_at": "..."
}
```

`original_filename` is dropped (the assessment no longer owns one).

**Backend:** single query joining Assessment + Student + a `COUNT` subquery on `assessment_pages` + a join on the first page (`page_number=1`) for the thumbnail key. One `get_download_url` call per row. At `limit=10`, that's 10 presigned URLs per dashboard render plus 10 audit_log rows.

### `GET /api/assessments/{id}` (NEW)

**Response:**

```json
{
  "id": "<uuid>",
  "student_id": "<uuid>",
  "student_name": "...",
  "status": "pending",
  "uploaded_at": "...",
  "pages": [
    {"page_number": 1, "original_filename": "page-1.png", "view_url": "https://..."},
    {"page_number": 2, "original_filename": "page-2.png", "view_url": "https://..."}
  ]
}
```

404 if missing, 403 if cross-org. Generates one presigned GET per page.

### `DELETE /api/assessments/{id}` (NEW)

Sets `deleted_at` on the assessment. Returns 204. 404 if missing, 403 if cross-org. Listing endpoints already filter on `Assessment.deleted_at.is_(None)`. Pages are not separately marked deleted; queries always go through the parent assessment.

## Frontend components

### `apps/web/components/assessment-upload-form.tsx` (rewrite)

Replaces the single-file `<input type="file">` with a drop-zone plus multi-file picker.

- Drop zone with dashed border and the text "Drop quiz pages here, or click to browse" — accepts drop events plus click-to-pick. Both paths use `accept="image/*"` and `multiple`.
- On select or drop: validate each file (image/*, ≤10MB), filter, sort the list alphabetically by filename, append to staged queue. Cap at 20.
- Staged queue: small thumbnail strip showing each page (`URL.createObjectURL(file)` for the in-browser preview), filename, file size, and an × remove button per page.
- Submit: POST `/api/assessments` with the `files` array → receive N presigned URLs → parallel PUT (concurrency 4) using a small async queue → on full success, redirect to `/assessments/[id]`. Inline progress: "Uploading 3 of 5…".
- On per-PUT failure: pause, show "X of Y pages uploaded — Retry remaining (Z)" with a retry button that re-PUTs only the unfinished pages using the same presigned URLs (1-hour window). Two retry attempts before giving up.
- `beforeunload` listener while uploads are in flight to surface the browser's native "leave site?" prompt.

### `apps/web/components/recent-assessments-list.tsx` (update)

Each row now renders `<img src={first_page_thumbnail_url}>` (CSS-sized to ~64×64) plus the `page_count` as a small "5 pages" mono-uppercase eyebrow. Filename comes off the row. Status badge stays. The whole row becomes a `<Link href="/assessments/[id]">`.

### `apps/web/components/delete-assessment-button.tsx` (new client component)

A small × button on each dashboard row. Click → confirm dialog → call `deleteAssessment` server action → `router.refresh()`. 404 on the call is treated as success (already deleted).

### `apps/web/app/assessments/[id]/page.tsx` (new server component)

Calls `GET /api/assessments/{id}`. Renders the header (student name — uploaded `<time-ago>` · status badge plus a delete button), then a vertical stack of full-size pages (each `<img>` with `view_url`). Click any image to open in a new tab.

### `apps/web/lib/types.ts` and `lib/actions.ts` (update)

- New types: `AssessmentPage`, `AssessmentDetail`.
- Updated type: `AssessmentListItem` drops `original_filename`, adds `page_count` and `first_page_thumbnail_url`.
- New action: `deleteAssessment(id)`.
- Updated action: `createAssessmentForUpload` now takes `{ student_id, files: [{ filename, content_type }, ...] }` and returns `{ assessment_id, pages: [...] }`.

## Data flow

**Upload happy path (5-page quiz):**

```
User              Frontend                Backend (FastAPI)            R2
────              ────────                ─────────────────            ──
drop 5 files →    sort + validate
                  show thumb queue
click Upload →    POST /api/assessments → tx: insert Assessment
                  {student_id, files[5]}    + 5 assessment_pages
                                            5x get_upload_url
                                          ← {assessment_id,
                                             pages: [5 PUTs]}
                  parallel PUT x4 (1 q'd) ───────────────────────────→ accepts
                  progress "1 of 5…"      ←─── 200 OK ──────────────── ack
                  ... → "5 of 5"
all 5 ok →        router.push('/assessments/<id>')
                  GET /api/assessments/<id> → load assessment + 5 pages
                                              5x get_download_url
                                            ← {pages: [5 view_urls]}
                  render detail page
```

**Dashboard render:**

```
GET /dashboard → fetchAssessments({limit: 10})
                 → backend: joins Assessment + Student + COUNT pages
                   + first-page join for thumbnail key
                   + 10x get_download_url
                 ← 10 list items each with first_page_thumbnail_url
                 server component renders 10 rows, each with <img>
```

**Delete flow:**

```
User clicks × → confirm dialog → server action deleteAssessment(id)
                                  → DELETE /api/assessments/<id>
                                  ← 204
                                router.refresh() → dashboard re-fetches
```

**Partial-failure recovery (PUT 3 of 5 fails):** the backend already has 5 page rows. The frontend keeps the `[{page_number, upload_url}, ...]` array in component state. On any PUT failure, the queue pauses, "X of Y uploaded — Retry remaining (Z)" appears. Retry re-PUTs only the unfinished pages using the same URLs. Two retry attempts. If user gives up: the assessment exists with some pages missing in R2 — the deferred orphan-cleanup spec catches via `HEAD` on each key.

**Tab-closed mid-upload:** in-flight PUTs cancel; orphan-cleanup catches.

## Error handling

**Backend validation (POST):**

| Condition | Status | `detail` |
|---|---|---|
| Missing or empty `files` | 400 | "files is required" |
| `len(files) > 20` | 400 | "max 20 pages per assessment" |
| Any `content_type` not `image/*` | 400 | "content_type must be image/*" |
| Any `filename` empty after strip | 400 | "filename is required" |
| Student not found | 404 | "student not found" |
| Student in different org | 403 | "student does not belong to your organization" |
| Auth missing/expired | 401 | (frontend → /sign-in) |

Backend uses one DB transaction. If `storage_service.get_upload_url` fails mid-way, the whole transaction rolls back and returns 500 — no partial assessment.

**R2 PUT failure (per-page):** as described in Data Flow. Two retry attempts before giving up.

**DELETE failures:** 404 is treated as success (already deleted by another tab); 500 shows a toast "Could not delete — please try again"; 403 shouldn't occur but is treated like 404.

**Double-click protection:** Submit button disables via `useTransition`'s `isPending` from first click.

**State recovery:** if the user reloads the upload page mid-staging, the drop-zone queue is gone. They re-pick files. Acceptable for v1.

## Testing

### Backend (pytest), 12 new tests

**`POST /api/assessments` (5 tests):**
1. `test_create_persists_assessment_and_pages` — 5-file happy path. Asserts: 1 Assessment row, 5 `AssessmentPage` rows with `page_number=1..5`, keys match `assessments/{org}/{student}/{aid}/page-{nnn}.{ext}`, response includes 5 presigned URLs, 5 audit_log rows with action `presigned_upload_issued`.
2. `test_create_rejects_empty_files` — 400 on `files: []`.
3. `test_create_rejects_too_many_files` — 21 files → 400.
4. `test_create_rejects_non_image` — at least one file with `text/plain` → 400.
5. `test_create_rejects_cross_org_student` — student in different org → 403.

**`GET /api/assessments` (1 new test):**
6. `test_list_returns_first_page_thumbnail_and_count` — fixture with one assessment of 2 pages. Response item includes `page_count: 2` and a presigned `first_page_thumbnail_url`.

**`GET /api/assessments/{id}` (3 tests):**
7. `test_detail_returns_pages_in_order` — 3-page fixture. Response has 3 pages sorted by `page_number`, each with `view_url`.
8. `test_detail_404_when_missing`.
9. `test_detail_403_cross_org`.

**`DELETE /api/assessments/{id}` (3 tests):**
10. `test_delete_soft_deletes_assessment` — DELETE → 204, `deleted_at` set, subsequent GET list excludes.
11. `test_delete_404_when_missing`.
12. `test_delete_403_cross_org`.

### Migration test

One pytest-driven migration verification: apply Alembic migration to a DB pre-seeded with one assessment that has `s3_url`, then assert the migration backfilled an `assessment_pages` row with `page_number=1` and the same key. Existing migration smoke patterns from Specs 2/4/8 cover the rest.

### Frontend manual smoke (close-out)

1. Drop 5 PNGs → thumbnail strip with × buttons → remove one → 4 remain.
2. Hit Upload → "Uploading 1 of 4 …" → "4 of 4 uploaded" → land on `/assessments/[id]` with 4 stacked images.
3. Back to /dashboard → see the new row with first-page thumbnail + "4 pages" eyebrow + "just now".
4. Click × on the row → confirm → row disappears.
5. Cross-org delete via curl → 403.

## Audit log volume

- POST: N rows per assessment-create (one per page's presigned PUT URL).
- GET list: N rows per render (one per row's first-page presigned GET URL); typically 10/render.
- GET detail: N rows per render (one per page's presigned GET URL).
- DELETE: 0 storage rows; assessment soft-delete doesn't touch storage.

Worst-case per active session likely under 100 rows/day per teacher. Fine for v1; flagged in Out of Scope as a candidate for batching.

## Out of scope (deferred)

- **Page-level edit** — delete one page, add pages to an existing assessment. Becomes its own spec after the diagnostic engine ships.
- **Drag-to-reorder pages on detail view.** Same spec as page-level edit.
- **Batch upload** — multiple students/assessments in one session.
- **PDF support** — multi-page PDF input. Requires server-side rendering. Separate spec.
- **Cloudflare Images / thumbnail transforms.** v1 serves full-size images and lets CSS resize.
- **Frontend test harness (Vitest).**
- **Orphan-cleanup spec** — periodic detector for assessments with missing R2 objects.
- **Audit log batching** — one row per assessment-create instead of N.
- **`localStorage` snapshot of staged files** — state recovery if the user reloads mid-staging.
- **Server-side file size enforcement** (R2 `content-length-range` policy).
- **Diagnostic engine integration** — Claude vision prompts. Separate spec, the next one.
- **Class assignment.**
- **Answer key upload** — separate spec; required for the engine.
