# Replace student DOB with grade level — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop `students.date_of_birth` (PII the product never uses), wire `student_profiles.grade_level` (already in schema from Spec 2) to a required grade 5–12 dropdown on the Add Student form, and fix the pre-existing bug where `create_student` never created the matching `student_profiles` row.

**Architecture:** Two atomic changes — backend (schema + model + router + migration) and frontend (types + action + form + display). Each lands as a single direct-to-main commit per the spec-retrofit workflow. Pre-prod project, no production data to migrate.

**Tech Stack:** Python FastAPI + SQLAlchemy 2 (async) + Alembic + Pydantic 2 (backend); Next.js 16 App Router + React + Tailwind + shadcn/ui (frontend); pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-04-29-student-grade-replaces-dob-design.md`.

---

## File Structure

| Path | Purpose | Change type |
|---|---|---|
| `apps/api/src/grade_sight_api/schemas/students.py` | Pydantic in/out shapes for the students router. | Modify: drop `date_of_birth`, add `grade_level: int` (in) / `int \| None` (out). |
| `apps/api/src/grade_sight_api/models/student.py` | SQLAlchemy model for the PII `students` table. | Modify: remove `date_of_birth` field + unused `date` import. |
| `apps/api/src/grade_sight_api/routers/students.py` | List + create endpoints. | Modify: `create_student` does an atomic two-row insert (Student + StudentProfile); `list_students` outer-joins StudentProfile to surface `grade_level`. |
| `apps/api/alembic/versions/<hash>_drop_student_dob.py` | Schema migration. | Create via `db:makemigration` autogenerate after model change. |
| `apps/api/tests/routers/test_students_router.py` | Router tests. | Modify: drop DOB-related cases; add 6 new cases covering grade required/range/atomicity/list-includes-grade. |
| `apps/web/lib/types.ts` | Shared TypeScript types. | Modify: `Student.date_of_birth` → `Student.grade_level: number \| null`. |
| `apps/web/lib/actions.ts` | Server actions including `createStudent`. | Modify: `date_of_birth?: string` → `grade_level: number`. |
| `apps/web/components/add-student-form.tsx` | The Add Student form. | Modify: replace the DOB date input with a native grade `<select>` (5–12, required, "Select Grade" placeholder). |
| `apps/web/app/students/page.tsx` | Roster page (list students). | Modify: replace the `DOB {date}` line with `Grade {N}`. |

---

## Task 1: Backend — replace DOB with grade

**Files:**
- Modify: `apps/api/src/grade_sight_api/schemas/students.py`
- Modify: `apps/api/src/grade_sight_api/models/student.py`
- Modify: `apps/api/src/grade_sight_api/routers/students.py`
- Create: `apps/api/alembic/versions/<hash>_drop_student_dob.py`
- Modify: `apps/api/tests/routers/test_students_router.py`

- [ ] **Step 1: Write the new failing tests**

Edit `apps/api/tests/routers/test_students_router.py`. Replace the existing `test_create_persists_with_org_id` and `test_create_rejects_empty_full_name` blocks (and any other DOB-referencing test) with the set below. Keep the existing `_seed_user`, `_override_deps`, and `test_list_returns_only_user_org_students` machinery — only replace the test cases that reference `date_of_birth`.

```python
async def test_create_persists_student_and_profile_with_grade(
    async_session: AsyncSession,
) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park", "grade_level": 8},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Marcus Park"
    assert body["grade_level"] == 8

    # Both rows exist and are linked.
    student = (
        await async_session.execute(
            select(Student).where(Student.full_name == "Marcus Park")
        )
    ).scalar_one()
    from grade_sight_api.models.student_profile import StudentProfile

    profile = (
        await async_session.execute(
            select(StudentProfile).where(StudentProfile.student_id == student.id)
        )
    ).scalar_one()
    assert profile.grade_level == "8"
    assert profile.organization_id == user.organization_id


async def test_create_rejects_empty_full_name(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "   ", "grade_level": 8},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 400


async def test_create_rejects_missing_grade(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park"},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_create_rejects_grade_below_range(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park", "grade_level": 4},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_create_rejects_grade_above_range(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)
    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students",
            json={"full_name": "Marcus Park", "grade_level": 13},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_list_includes_grade_via_profile_join(
    async_session: AsyncSession,
) -> None:
    """list_students LEFT-JOINs student_profiles and surfaces grade_level."""
    from grade_sight_api.models.student_profile import StudentProfile

    user = await _seed_user(async_session)

    # Seed two students: one with a profile, one without (legacy row).
    student_a = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="With Profile",
    )
    student_b = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name="Legacy Row",
    )
    async_session.add_all([student_a, student_b])
    await async_session.flush()
    async_session.add(
        StudentProfile(
            student_id=student_a.id,
            organization_id=user.organization_id,
            grade_level="9",
        )
    )
    await async_session.flush()

    _override_deps(user, async_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/students")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    by_name = {s["full_name"]: s for s in body["students"]}
    assert by_name["With Profile"]["grade_level"] == 9
    assert by_name["Legacy Row"]["grade_level"] is None
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter api test -- tests/routers/test_students_router.py -v`
Expected: failures referencing `grade_level` not on the Pydantic model and/or unknown field. Some tests will pass partially because the schema still accepts `full_name`, but grade-related assertions and validation cases will fail.

- [ ] **Step 3: Update Pydantic schemas**

Replace `apps/api/src/grade_sight_api/schemas/students.py` entirely with:

```python
"""Pydantic schemas for the students router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    full_name: str
    grade_level: int = Field(..., ge=5, le=12)


class StudentResponse(BaseModel):
    id: UUID
    full_name: str
    grade_level: int | None
    created_at: datetime


class StudentListResponse(BaseModel):
    students: list[StudentResponse]
```

Note: drops `from datetime import date` (no longer used). Drops `model_config = {"from_attributes": True}` because the response is now constructed manually in the router (the join means `grade_level` doesn't live on the `Student` SQLAlchemy model).

- [ ] **Step 4: Drop `date_of_birth` from the SQLAlchemy model**

Edit `apps/api/src/grade_sight_api/models/student.py`:

Remove these lines:
```python
from datetime import date
```
```python
    date_of_birth: Mapped[date | None] = mapped_column(nullable=True)
```

The remaining `from typing import Any`, `from uuid import UUID, uuid4`, etc. all stay. Verify no other reference to `date` in the file remains.

- [ ] **Step 5: Generate the Alembic migration**

Run: `pnpm --filter api db:makemigration "drop_student_dob"`

This invokes `alembic revision --autogenerate -m "drop_student_dob"`. Alembic compares the (modified) model to the current DB and generates a migration file under `apps/api/alembic/versions/<hash>_drop_student_dob.py`.

- [ ] **Step 6: Inspect the generated migration**

Open the new file. The `upgrade()` body should be a single line:

```python
def upgrade() -> None:
    op.drop_column("students", "date_of_birth")


def downgrade() -> None:
    op.add_column(
        "students",
        sa.Column("date_of_birth", sa.Date(), nullable=True),
    )
```

If autogenerate produced anything else (extra ops, wrong table), edit the file to match exactly. Autogenerate occasionally adds index drops or relationship changes that aren't intended — strip them.

- [ ] **Step 7: Apply the migration locally**

Run: `pnpm --filter api db:migrate`

Expected: alembic prints `Running upgrade <prev> -> <new>, drop_student_dob`. Verify by connecting to the dev DB:

```
\d students
```

— `date_of_birth` column should be gone.

- [ ] **Step 8: Update the router**

Replace `apps/api/src/grade_sight_api/routers/students.py` entirely with:

```python
"""Students router — list and create students for the authenticated user's org."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.user import User
from ..schemas.students import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
)

router = APIRouter()


def _grade_str_to_int(raw: str | None) -> int | None:
    """Coerce student_profiles.grade_level (string column) to int for the API."""
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        # Defensive: legacy/non-numeric values surface as null in the API.
        return None


@router.get("/api/students", response_model=StudentListResponse)
async def list_students(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentListResponse:
    """List students for the authenticated user's org, with grade from profile."""
    stmt = (
        select(Student, StudentProfile.grade_level)
        .outerjoin(StudentProfile, StudentProfile.student_id == Student.id)
        .where(
            Student.organization_id == user.organization_id,
            Student.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    rows = (await db.execute(stmt)).all()
    return StudentListResponse(
        students=[
            StudentResponse(
                id=s.id,
                full_name=s.full_name,
                grade_level=_grade_str_to_int(g),
                created_at=s.created_at,
            )
            for s, g in rows
        ]
    )


@router.post(
    "/api/students",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student(
    payload: StudentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StudentResponse:
    """Create a student + matching student_profile in one transaction."""
    if not payload.full_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="full_name is required",
        )

    student = Student(
        created_by_user_id=user.id,
        organization_id=user.organization_id,
        full_name=payload.full_name.strip(),
    )
    db.add(student)
    await db.flush()  # populate student.id

    profile = StudentProfile(
        student_id=student.id,
        organization_id=user.organization_id,
        grade_level=str(payload.grade_level),
    )
    db.add(profile)
    await db.flush()

    return StudentResponse(
        id=student.id,
        full_name=student.full_name,
        grade_level=payload.grade_level,
        created_at=student.created_at,
    )
```

- [ ] **Step 9: Run tests to confirm green**

Run: `pnpm --filter api test`
Expected: all 121+ tests pass (including the 6 new student tests). No DOB-referencing failures.

- [ ] **Step 10: Run typecheck to confirm green**

Run: `pnpm --filter api typecheck`
Expected: `Success: no issues found in 57 source files`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/grade_sight_api/schemas/students.py \
        apps/api/src/grade_sight_api/models/student.py \
        apps/api/src/grade_sight_api/routers/students.py \
        apps/api/alembic/versions/*_drop_student_dob.py \
        apps/api/tests/routers/test_students_router.py
git commit -m "$(cat <<'EOF'
backend: replace student DOB with grade_level on student_profiles

Drops students.date_of_birth (PII the product never uses; CLAUDE.md
data-minimization commitment). Wires student_profiles.grade_level
(already in schema from Spec 2) into create_student + list_students.

create_student now does an atomic two-row insert — Student + StudentProfile
— in a single transaction. Fixes pre-existing bug where every student
was created without the required 1:1 profile row.

Pydantic validates 5 <= grade_level <= 12. New tests cover required,
range, atomicity, and list-includes-grade-via-join.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend — replace DOB with grade

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/actions.ts`
- Modify: `apps/web/components/add-student-form.tsx`
- Modify: `apps/web/app/students/page.tsx`

- [ ] **Step 1: Update the Student type**

Edit `apps/web/lib/types.ts`. Replace the `Student` interface (lines 9–14) with:

```typescript
export interface Student {
  id: string;
  full_name: string;
  grade_level: number | null;
  created_at: string;
}
```

- [ ] **Step 2: Update the createStudent server action**

Edit `apps/web/lib/actions.ts`. Replace the `createStudent` function (lines 27–40) with:

```typescript
export async function createStudent(input: {
  full_name: string;
  grade_level: number;
}): Promise<Student> {
  const response = await callApi(`/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/students failed: ${response.status}`);
  }
  return (await response.json()) as Student;
}
```

- [ ] **Step 3: Replace the DOB input with a grade dropdown in the form**

Replace `apps/web/components/add-student-form.tsx` entirely with:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createStudent } from "@/lib/actions";

const GRADE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12] as const;

export function AddStudentForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Name is required");
      return;
    }
    if (!grade) {
      setError("Grade is required");
      return;
    }
    startTransition(async () => {
      try {
        await createStudent({
          full_name: fullName.trim(),
          grade_level: Number(grade),
        });
        setFullName("");
        setGrade("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add student");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-sm)] border border-rule bg-paper p-6"
    >
      <h3 className="font-serif text-xl text-ink">Add a student</h3>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="full_name" className="block text-sm text-ink-soft">
            Full name <span className="text-mark">*</span>
          </label>
          <input
            id="full_name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
            required
          />
        </div>
        <div>
          <label htmlFor="grade" className="block text-sm text-ink-soft">
            Grade <span className="text-mark">*</span>
          </label>
          <select
            id="grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
            required
          >
            <option value="" disabled>
              Select Grade
            </option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={String(g)}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add student"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Replace the DOB display on the roster page**

Edit `apps/web/app/students/page.tsx`. Replace lines 35–42 (the `<li>` block) with:

```tsx
              <li key={s.id} className="flex items-baseline justify-between py-3">
                <span className="text-base text-ink">{s.full_name}</span>
                {s.grade_level != null && (
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                    Grade {s.grade_level}
                  </span>
                )}
              </li>
```

- [ ] **Step 5: Run web typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean (no errors). If anything still references `date_of_birth` or `dob`, the typecheck flags it.

- [ ] **Step 6: Run web tests**

Run: `pnpm --filter web test`
Expected: existing 10 sentry-scrubber tests still pass. No new vitest tests required (no UI tests harness for the form).

- [ ] **Step 7: Manual click-through verification**

The dev server and FastAPI backend are already running on ports 3000 and 8000 from earlier in the session. If they aren't:

```bash
pnpm --filter web dev   # port 3000
pnpm --filter api dev   # port 8000 (separate terminal)
```

Then in the browser:
1. Navigate to `http://localhost:3000/students` (sign in if needed).
2. The Add Student form shows two fields: Full name (text) and Grade (dropdown showing "Select Grade").
3. Try submitting with no grade → form blocks submit, "Grade is required" shown.
4. Pick grade 8, enter a name, submit → student appears in the list with `Grade 8`.
5. Confirm via DB or backend log that both the `students` row and the `student_profiles` row exist.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/types.ts \
        apps/web/lib/actions.ts \
        apps/web/components/add-student-form.tsx \
        apps/web/app/students/page.tsx
git commit -m "$(cat <<'EOF'
web: replace student DOB with required grade dropdown

Drops the date-of-birth input from the Add Student form and roster
display. Adds a required grade <select> with options 5–12 and
"Select Grade" placeholder. createStudent server action now sends
grade_level: number to the backend, which writes it to
student_profiles.grade_level in the same transaction as the student
row (Spec 2 schema, just unwired until now).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck across the repo**

Run: `pnpm typecheck`
Expected: turbo runs `typecheck` in all packages — web (tsc), api (mypy). All green.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: turbo runs vitest (web) + pytest (api). All green. Should land around 119 + 6 new = 125 api tests passing, 10 web tests passing.

- [ ] **Step 3: Confirm no remaining DOB references in src**

Run: `git grep -nE 'date_of_birth|\bdob\b|\bDOB\b' apps -- ':!*.venv*' ':!*.next*' ':!*node_modules*' ':!*__pycache__*'`

Expected: no output, OR only matches in `.venv` (Stripe SDK is allowed to have its own `dob` references and is excluded above).

- [ ] **Step 4: Push to origin**

This is a privacy-positive change and should land on `main` once verified. Confirm with the user before pushing.

```bash
# only after user says "push":
git push origin main
```

---

## Self-Review

**Spec coverage (against the design doc):**
- Drop `students.date_of_birth` column → Task 1 Steps 4–7 (model + autogenerated migration).
- Drop `date_of_birth` from `models/student.py` → Task 1 Step 4.
- Drop `date_of_birth` from `schemas/students.py`, add `grade_level` (in/out) → Task 1 Step 3.
- `routers/students.py` atomic create with profile + range validation + LEFT JOIN list → Task 1 Steps 8–10.
- Frontend types/action/form/display → Task 2 Steps 1–4.
- Tests for required/range/atomicity/list-grade → Task 1 Step 1 (6 cases).
- Native `<select>` (not shadcn) with required + "Select Grade" placeholder → Task 2 Step 3.
- Pre-existing bug fix (missing `student_profiles` row creation) → Task 1 Step 8.
- Verification grep for `date_of_birth` / `dob` → Task 3 Step 3.

**Placeholder scan:** No "TBD"/"TODO"/"appropriate" terms. Migration filename uses `<hash>` placeholder for the autogenerated alembic prefix, which is unavoidable — Step 5 generates it; Step 6 inspects it; Step 11's `git add` glob handles the unknown prefix.

**Type consistency:**
- `grade_level: int` on `StudentCreate` (in) — Task 1 Step 3.
- `grade_level: int | None` on `StudentResponse` (out) — Task 1 Step 3.
- `grade_level: number | null` on TypeScript `Student` interface — Task 2 Step 1.
- `grade_level: number` on `createStudent` action input — Task 2 Step 2.
- `grade` form state is `string` (the `<select value>`) and converted via `Number(grade)` at submit — Task 2 Step 3. Consistent.
- `student_profiles.grade_level` column is `Mapped[str | None]` (existing schema) — router casts both directions via `_grade_str_to_int` and `str(payload.grade_level)`. Consistent.
