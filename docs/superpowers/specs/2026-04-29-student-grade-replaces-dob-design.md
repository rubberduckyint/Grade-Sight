# Replace student DOB with grade level — design

**Status:** approved 2026-04-29.
**Type:** privacy retrofit + small UI addition (Approach A from brainstorm).
**Mode:** spec retrofit — direct-to-main commits, push on cue (per workflow memory).
**Out of scope:** teacher class-creation flow, bulk-grade workflow, course/subject on student. Captured separately for a future v2 step.

## Why

CLAUDE.md commits to "data minimization: collect only what's needed." `students.date_of_birth` is PII (lets you compute exact age; combined with name = strong identifier) that the product does not use anywhere. We replace it with `student_profiles.grade_level` — a bucket of millions per value, useful for content adaptation (the LILY pattern), and already present in the schema from Spec 2.

## What changes

### Database

- Drop `students.date_of_birth` column (Alembic migration).
- `student_profiles.grade_level` already exists; no schema change needed.
- Pre-existing bug: `routers/students.py` creates a `Student` row but never creates the matching `student_profiles` row, leaving every student without a profile. This change fixes that — student creation now writes both rows in one transaction.

### Backend (apps/api)

| File | Change |
|---|---|
| `models/student.py` | Remove `date_of_birth: Mapped[date \| None]` field. |
| `schemas/students.py` | Remove `date_of_birth` from `StudentCreate` and `StudentResponse`. Add `grade_level: int` (required) to `StudentCreate`. Add `grade_level: int \| None` (read-back from profile) to `StudentResponse`. |
| `routers/students.py` | `create_student`: validate `5 <= grade_level <= 12`. In one transaction: insert `Student`, then insert `StudentProfile` with `grade_level` and the new student's `id`. `list_students`: join to `student_profiles` and include `grade_level` in the response. |
| `alembic/versions/<new>_drop_student_dob.py` | New migration: `op.drop_column('students', 'date_of_birth')`. Down migration re-adds the nullable column. |

Pydantic validation: `grade_level: int = Field(..., ge=5, le=12)` on `StudentCreate`. Server returns 400 for out-of-range or missing values.

### Frontend (apps/web)

| File | Change |
|---|---|
| `lib/types.ts` | `Student.date_of_birth` → remove. Add `Student.grade_level: number \| null`. |
| `lib/actions.ts` | `addStudent` action: remove `date_of_birth?: string`, add `grade_level: number` (required). |
| `components/add-student-form.tsx` | Replace the DOB date input with a `<select>` of options 5–12. Required (HTML `required` + the form submit handler refuses to submit without a selection). Default state: empty option labeled "Select Grade". Label: "Grade". No helper text. |
| `app/students/page.tsx` | Replace the `DOB {...}` line with `Grade {grade_level}` (or omit gracefully if `grade_level` is null — only possible for legacy rows from before this change). |

The grade `<select>` uses the existing shadcn/ui `<Select>` primitive (already in `components/ui/select.tsx`) for visual consistency with the rest of the form.

## Data flow

1. User opens Add Student form. Form has two fields: full name (text, required), grade (select 5–12, required).
2. User picks grade and submits. Server action `addStudent({ full_name, grade_level })` validates client-side that grade is set, calls `POST /api/students` with the payload.
3. API validates `5 <= grade_level <= 12` (Pydantic). Begins a transaction:
   - Inserts `students` row (full_name, organization_id, created_by_user_id).
   - Flushes to get the new student id.
   - Inserts `student_profiles` row (student_id, organization_id, grade_level).
   - Commits.
4. API returns `StudentResponse` with `grade_level` joined from the profile.
5. Frontend redirects back to `/students` (existing behavior). Display shows `Grade {N}` next to each student.

## Error handling

- Form validation: HTML `required` on the select prevents submit without a choice.
- Server validation: Pydantic returns 422 for missing/invalid grade. Existing form error display path catches this (already wired for `full_name` empty-string).
- Transaction integrity: if `student_profiles` insert fails after `students` insert, the transaction rolls back — no orphan PII row.
- Legacy rows (created before this change, with no profile): the `list_students` LEFT JOIN handles `grade_level = null` cleanly. UI omits the grade line if null. No backfill — pre-prod, no real user data.

## Testing

### Backend (pytest)

Add to `tests/routers/test_students_router.py`:

- `test_create_student_with_valid_grade` — POST with grade 8 → 201, both `students` and `student_profiles` rows exist with correct values.
- `test_create_student_grade_required` — POST without grade → 422.
- `test_create_student_grade_below_range` — POST with grade 4 → 422.
- `test_create_student_grade_above_range` — POST with grade 13 → 422.
- `test_create_student_atomicity` — induce a failure on profile insert, assert students table has no orphan row.
- `test_list_students_includes_grade` — pre-seed a student + profile, GET → response includes `grade_level`.

Drop or update existing `date_of_birth`-related test cases.

### Frontend (vitest)

No new vitest target needed — the form is integration-tested manually, and `sentry-scrubber.test.ts` is the only existing vitest suite. Manual verification covers the form flow.

### Manual verification

- `pnpm --filter web typecheck` → 0
- `pnpm --filter api typecheck` → 0
- `pnpm test` → all green
- `pnpm dev` from project root → /students renders, Add Student form shows grade dropdown 5–12, can't submit without grade, successful submit creates student and profile, list shows "Grade N".

## Migration ordering

Pre-prod project, no real user data. The Alembic migration drops the column outright:

```python
def upgrade() -> None:
    op.drop_column('students', 'date_of_birth')

def downgrade() -> None:
    op.add_column(
        'students',
        sa.Column('date_of_birth', sa.Date(), nullable=True),
    )
```

Run order: code change + migration land together in a single direct-to-main commit (or two adjacent commits). Apply migration before deploying the new code.

## Verification checklist

- DB: `students.date_of_birth` column removed; `student_profiles.grade_level` populated for new students.
- Backend: typecheck + tests green; new tests cover required/range validation and atomicity.
- Frontend: typecheck green; Add Student form requires grade; list page shows grade.
- Privacy: zero remaining references to `date_of_birth` / `dob` in `apps/web` or `apps/api/src` (verified via `grep -rn 'date_of_birth\|\bdob\b'`).

## Open questions

None remaining for Approach A. The teacher class-creation flow + bulk-grade workflow surfaced during this brainstorm is captured in `docs/superpowers/plans/followups.md` under a new "Future v2 steps to schedule" section.
