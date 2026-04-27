# Assessment Upload UI Shell — Design

**Spec 9 of Phase 1 MVP**
**Date:** 2026-04-26
**Status:** approved (design)
**Audience for v1:** teacher (parent flow deferred)

## Goal

Build the smallest end-to-end upload flow that proves the prototype works: a teacher can sign in, create students, upload a photo of a graded quiz, and see it stored. No diagnostic engine yet — uploaded assessments stay in `pending` status until a future spec wires Claude vision. This spec is the UI shell + the backend endpoints that consume the existing `storage_service` (Spec 5) and the existing `assessments` / `students` tables (Spec 2).

## Scope

**In scope:**
- Two new backend routers: `routers/students.py` (`GET`, `POST`), `routers/assessments.py` (`GET`, `POST`).
- New Pydantic schemas in `schemas/students.py` and `schemas/assessments.py`.
- Three new / updated frontend pages: `/upload`, `/students`, and an updated `/dashboard` with a prominent "Upload assessment" CTA + recent-assessments list.
- Four new frontend components: `StudentPicker`, `AssessmentUploadForm`, `RecentAssessmentsList`, `AddStudentForm`.
- Four new `lib/api.ts` helpers: `fetchStudents`, `createStudent`, `fetchAssessments`, `createAssessmentForUpload`.
- Seven backend unit tests covering tenant scoping, validation, and the upload-row-create path.

**Out of scope (deferred):**
- **Diagnostic engine integration** — uploaded assessments stay `pending`; no Claude vision call. Separate spec.
- **`/assessments/[id]` detail view** — recent list shows filename + status, no click-through.
- **Class assignment** — `class_id` stays nullable, not surfaced in UI.
- **Answer key upload** — `answer_key_id` stays nullable, separate spec.
- **Batch upload** — teacher-only future feature.
- **Image preview / cropping** — user picks file, sees name + size, submits.
- **Orphan-row cleanup** — `pending` rows whose R2 upload never completed accumulate. A future housekeeping spec or the diagnostic engine spec adds the detector.
- **Frontend test harness** — manual smoke for v1; we don't have a frontend test framework yet.
- **Parent flow** — same primitives but different UX shape (1-2 students, no roster page). Add later if/when we add parent as a target.

## Architectural choices (with rationale)

### Teacher flow first, parent deferred

User decision (2026-04-26): teacher is the bigger market. This spec targets teacher-flavored UX (searchable student picker, dedicated `/students` roster page, prominent upload CTA on dashboard). `PROJECT_BRIEF.md` currently says "parent mode (primary early traction)" — that framing now contradicts the GTM and should be updated in a separate small commit. Out of this spec.

### Browser-direct upload via presigned URL

Files go straight from browser to R2 via the presigned PUT URL from `storage_service.get_upload_url`. FastAPI is never in the upload path. Rationale: avoids large request bodies hitting our API, removes need for streaming-upload machinery, scales naturally, matches how the Spec 5 storage abstraction was designed.

### Single endpoint creates row + returns presigned URL

`POST /api/assessments` does double duty: it INSERTs the `assessments` row in `pending` status AND returns the presigned URL the browser uses to upload. Alternative is two endpoints (one for the row, one for the URL); doesn't add anything since they always run back-to-back and the row needs to exist before the upload happens (so the diagnostic engine has something to find later). Single endpoint is cleaner.

The trade-off: if the browser fails to upload after we created the row, that row is an orphan (status `pending`, R2 object never created). For v1 we accept this; future cleanup spec handles it.

### Tenant scoping by `organization_id`, not `user_id`

Every backend query filters by `current_user.organization_id`. A teacher in org A cannot see students or assessments from org B even if a `student_id` is guessed. `POST /api/assessments` validates the student belongs to the user's org before accepting the upload (returns 403 otherwise).

### R2 key format hides PII

Keys are `assessments/{organization_id}/{student_id}/{assessment_id}.{ext}`. No names anywhere. The `original_filename` is stored in the DB row only (which is fine — that table is the audit-log target).

### Frontend gates file size; backend doesn't

10MB cap on the client. Backend doesn't enforce — presigned PUT URLs in S3/R2 don't natively enforce content-length without a more complex POST-policy signature, which is more work for prototype value. R2 free tier absorbs malicious bypass at prototype scale. Documented as a known limitation; future hardening spec can add server-side enforcement.

## Components

### Backend endpoint contracts

```
GET /api/students
  → 200 {students: [{id, full_name, date_of_birth, created_at}]}
  → 401 if unauthenticated

POST /api/students
  body: {full_name: string, date_of_birth?: ISO date string}
  → 201 {id, full_name, date_of_birth, created_at}
  → 400 if full_name is empty
  → 401 if unauthenticated

GET /api/assessments?limit=20
  → 200 {assessments: [{id, student_id, student_name, original_filename, status, uploaded_at}]}
       Default limit 20, max 100. Ordered by uploaded_at DESC.
       Includes student_name via JOIN (one query, no N+1).

POST /api/assessments
  body: {student_id: UUID, original_filename: string, content_type: string}
  → 201 {assessment_id, upload_url, key}
       Generates R2 key: assessments/{org_id}/{student_id}/{assessment_id}.{ext}
       INSERTs assessment row in pending status with s3_url=key
       Returns presigned PUT URL (10 min expiry) via storage_service
  → 400 if content_type is not image/*
  → 400 if original_filename empty
  → 403 if student.organization_id != user.organization_id
  → 404 if student_id doesn't exist
```

### Backend Pydantic schemas

`apps/api/src/grade_sight_api/schemas/students.py`:

```python
class StudentCreate(BaseModel):
    full_name: str
    date_of_birth: date | None = None

class StudentResponse(BaseModel):
    id: UUID
    full_name: str
    date_of_birth: date | None
    created_at: datetime

class StudentListResponse(BaseModel):
    students: list[StudentResponse]
```

`apps/api/src/grade_sight_api/schemas/assessments.py`:

```python
class AssessmentCreateRequest(BaseModel):
    student_id: UUID
    original_filename: str
    content_type: str

class AssessmentCreateResponse(BaseModel):
    assessment_id: UUID
    upload_url: str
    key: str

class AssessmentListItem(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    original_filename: str
    status: AssessmentStatus
    uploaded_at: datetime

class AssessmentListResponse(BaseModel):
    assessments: list[AssessmentListItem]
```

### Frontend pages

**`/upload` (`apps/web/app/upload/page.tsx`)** — server component:
1. Server-fetches the students list via `fetchStudents()`.
2. Wraps content in `AppShell` + `PageContainer`.
3. Renders `<AssessmentUploadForm students={students} />`.

**`/students` (`apps/web/app/students/page.tsx`)** — server component:
1. Server-fetches students.
2. Wraps in `AppShell` + `PageContainer`.
3. Renders a list of students (each as a `StudentListItem` row showing full_name + DOB if set + "added X ago") and a `<AddStudentForm />` below.

**Updated `/dashboard` (`apps/web/app/dashboard/page.tsx`)**:
- Existing greeting + AppShell stay.
- Adds a primary `<Button asChild><Link href="/upload">Upload assessment</Link></Button>` after the greeting.
- Adds a `<RecentAssessmentsList limit={10} />` (server component) below the CTA.
- If there are zero assessments yet, render the existing `EmptyState` ("No assessments yet…"). If there are some, render the list inside a Card.

### Frontend components

`apps/web/components/student-picker.tsx` (client):
- Props: `students: StudentResponse[]`, `value: UUID | null`, `onChange: (id: UUID) => void`.
- Searchable combo-box. As the user types, filters students by full_name (case-insensitive substring match).
- "+ Add new student" appears at the bottom of the dropdown when no exact match. Clicking opens an inline mini-form (full_name only). Submit calls `createStudent()` and pre-selects the result.

`apps/web/components/assessment-upload-form.tsx` (client):
- Props: `students: StudentResponse[]`.
- Composes `<StudentPicker />` + a file input (with drag-and-drop dropzone) + submit button.
- File input enforces `accept="image/*"` and rejects > 10MB before submit (shows inline error).
- On submit:
  1. Calls `createAssessmentForUpload({student_id, original_filename, content_type})` → `{upload_url, assessment_id}`.
  2. PUTs the file directly to `upload_url` with `Content-Type: <picked>` header.
  3. On 2xx: `router.push("/dashboard?uploaded=" + assessment_id)`.
  4. On error: shows inline error, leaves form filled.

`apps/web/components/recent-assessments-list.tsx` (server component):
- Props: `assessments: AssessmentListItem[]`.
- Renders each row with: filename, student_name, status badge, "uploaded X ago".
- No click-through (no detail view in v1).

`apps/web/components/add-student-form.tsx` (client):
- Single name field (required) + optional DOB date input.
- On submit: `createStudent()`, then `router.refresh()` to re-fetch the list.

### `lib/api.ts` additions

```ts
async function fetchStudents(): Promise<Student[]>
async function createStudent(input: {full_name: string; date_of_birth?: string}): Promise<Student>
async function fetchAssessments(opts?: {limit?: number}): Promise<AssessmentListItem[]>
async function createAssessmentForUpload(input: {
  student_id: string;
  original_filename: string;
  content_type: string;
}): Promise<{assessment_id: string; upload_url: string; key: string}>
```

All four use the existing `authedFetch` pattern.

## Data flow

### Upload happy path

```
Browser              Frontend (server)         API                    R2
  │                       │                     │                     │
  │  pick student + file  │                     │                     │
  ├──────────────────────>│                     │                     │
  │                       │  POST /api/         │                     │
  │                       │  assessments        │                     │
  │                       ├────────────────────>│                     │
  │                       │                     │ verify student      │
  │                       │                     │ org match           │
  │                       │                     │ generate r2 key     │
  │                       │                     │ INSERT assessment   │
  │                       │                     │ (pending)           │
  │                       │                     │ storage_service.    │
  │                       │                     │ get_upload_url      │
  │                       │                     ├────────────────────>│
  │                       │                     │<──── presigned URL──┤
  │                       │<── {upload_url, ────┤                     │
  │                       │     assessment_id}  │                     │
  │<── upload_url ────────┤                     │                     │
  │                                                                   │
  │   PUT to presigned URL with file bytes                             │
  │   (Content-Type: image/jpeg, no FastAPI in path)                   │
  ├───────────────────────────────────────────────────────────────────>│
  │<────── 200 OK ─────────────────────────────────────────────────────│
  │                       │                     │                     │
  │ navigate to /dashboard?uploaded=<id>        │                     │
  ├──────────────────────>│                     │                     │
  │                       │  GET /api/          │                     │
  │                       │  assessments        │                     │
  │                       ├────────────────────>│                     │
  │                       │<── recent uploads ──┤                     │
  │<── render dashboard ──┤                     │                     │
```

The assessment row exists BEFORE the upload completes. If the browser fails to upload after the row is created, the row stays in `pending` status with no R2 object behind it — an orphan. v1 accepts this; future cleanup spec handles.

### Student creation

`POST /api/students` with `{full_name}` → server validates non-empty name, INSERTs with `created_by_user_id = current_user.id` and `organization_id = current_user.organization_id`, returns the new row. No external dependencies.

### Listing assessments

`GET /api/assessments` joins `assessments → students` on `student_id`, filters by `student.organization_id = current_user.organization_id`, orders by `uploaded_at DESC`, limits to 20 by default. Returns `{assessments: [{id, student_id, student_name, ...}]}`.

The dashboard's `RecentAssessmentsList` renders this directly. One join, no N+1.

## Error handling

### Frontend (upload form)

| Error | Treatment |
|---|---|
| File > 10MB selected | Inline error "File too large (max 10MB)"; submit disabled. |
| Non-image content type | Inline error "Only image files supported"; submit disabled. |
| `POST /api/assessments` 4xx | Inline error "Couldn't start upload — try refreshing or pick a different student." Form stays filled. |
| `POST /api/assessments` 5xx | Inline error "Server error — try again." Form stays filled. |
| PUT to presigned URL fails (network or R2 4xx) | Inline error "Upload interrupted — try again." Form stays filled. The row is now an orphan. |
| Submitting while a previous submit is in flight | Submit button disabled + spinner; ignore extra clicks. |

### Backend

| Endpoint | Failure mode | Response |
|---|---|---|
| `POST /api/students` | empty `full_name` | 400 `{detail: "full_name is required"}` |
| `POST /api/assessments` | `student_id` not in DB | 404 |
| `POST /api/assessments` | student belongs to a different org | 403 |
| `POST /api/assessments` | content_type not `image/*` | 400 |
| `POST /api/assessments` | `storage_service.get_upload_url` raises | 500; `storage_service` itself logs to `audit_log` |
| Any endpoint | unauthenticated | 401 (Clerk middleware handles) |

### Data minimization

R2 keys never contain names. The `original_filename` field in the DB row may technically contain student-identifying info if the teacher named the file with the student's name; this is acceptable because the `assessments` row is in our DB (already PII-handling-aware via the audit_log layer) and never leaves to a third party except via the storage_service abstraction (which logs every access).

## Testing

### Backend unit tests

In `apps/api/tests/routers/`:

1. **`test_students_create.py::test_create_persists_with_org_id`** — POST with mocked Clerk auth → row written with the user's `organization_id`.
2. **`test_students_create.py::test_create_rejects_empty_full_name`** — empty string → 400.
3. **`test_students_list.py::test_list_returns_only_user_org_students`** — seed two orgs; assert only the requesting org's students return.
4. **`test_assessments_create.py::test_create_persists_pending_row`** — POST with mocked `storage_service.get_upload_url` → assessment row in `pending` status, `s3_url` set to the R2 key, response includes `upload_url`.
5. **`test_assessments_create.py::test_create_rejects_cross_org_student`** — student belongs to org A; requesting user belongs to org B → 403.
6. **`test_assessments_create.py::test_create_rejects_non_image_content_type`** — `content_type: text/plain` → 400.
7. **`test_assessments_list.py::test_list_filters_by_user_org`** — same shape as #3 but for assessments.

All tests use the existing `async_session` fixture and mock `storage_service.get_upload_url` (no real R2 calls in CI).

### Frontend tests

Skipped for v1. We don't currently have a frontend test harness (no Vitest setup, no Playwright). Adding one is out of scope for this spec.

**Manual smoke test before merge:**
1. Sign up as a teacher (or use an existing teacher account).
2. Visit `/students`, add a student.
3. Visit `/upload`, pick the student, pick an image file, submit.
4. Verify redirect to `/dashboard?uploaded=...` and the recent list shows the new row.
5. Verify in the R2 dashboard (or via storage_service smoke test) that the object exists at the expected key.

### Integration / smoke

The Spec 5 storage smoke test already exercises real R2 round-trip. We don't add another. The new code paths are covered by mocked-storage unit tests.

## Out of scope (queued for later)

- **Diagnostic engine integration** — wire Claude vision to consume `pending` assessments. The biggest follow-up.
- **`/assessments/[id]` detail view** — small follow-up; presigned download URL endpoint + page.
- **Class assignment** — surface in the upload form once teachers ask for it.
- **Answer key upload** — separate spec. Required for the diagnostic engine.
- **Batch upload** — teacher feature; defer until single-upload demo lands.
- **Orphan-row cleanup** — periodic detector for `pending` rows with no R2 object.
- **Server-side file size enforcement** — content-length-range policy on presigned PUT.
- **Frontend test harness** — Vitest setup + tests for upload form, student picker.
- **GTM doc update** — `PROJECT_BRIEF.md` and `CLAUDE.md` references to "parent mode (primary early traction)" need updating to reflect the teacher-first decision. Small follow-up commit.
- **Image preview before submit** — show a thumbnail of the selected file.
- **Parent flow** — once teacher prototype is validated, add parent variant.
