# Step 13c · Teacher Class Flow — Design Spec

**Date:** 2026-05-01
**Branch:** `step-13c-class-flow`
**Scope:** Build the teacher class-creation flow so teachers can group their students into classes (e.g., "4th period · Algebra 1") and link assessments to a class. Schema is already in place from Spec 2 — this step adds the API surface and UI.

---

## 1. Goal

Unblock Step 13d (bulk-grade workflow) by giving teachers a way to create classes, manage rosters, and link assessments to a class. Schema (`Klass`, `ClassMember` with historical `left_at`, partial unique index) was scaffolded in Spec 2; this step adds the application layer.

## 2. Scope

### In scope

- Two new pages: `/classes` (list with archive toggle) and `/classes/[id]` (detail + roster + edit/archive affordances).
- Six new endpoints under `/api/classes` for create/list/detail/edit/archive + add/remove members.
- Four server actions on the frontend.
- New "Classes" tab in `TEACHER_TABS` (between Students and Assessments).
- Edit class (rename, change subject, change grade level).
- Archive class (soft-delete with "Show archived" toggle on list).
- Add students to class (multi-select existing students).
- Remove student from class (sets `left_at`).
- Test coverage: ~22 backend cases + 2 frontend dialog test files.

### Out of scope (followups)

- Bulk-paste roster import (real start-of-year flow; needs its own brainstorm)
- Class assignment in `/upload` flow (pairs with Step 13d bulk-grade)
- "Class" column on `/assessments` archive (one-line addition once 13c merges)
- Backend gate on archived-class member operations (permissive in v1)
- "Show left students" on roster

## 3. Architecture

### Routes

| Path | Auth | What it is |
|---|---|---|
| `/classes` | teacher | List of classes — table with Name · Subject · Grade · Students · ›. Archive toggle when archived classes exist. |
| `/classes/[id]` | teacher | Detail — header + roster + edit/archive affordances. Read-only when archived (only Unarchive is shown). |

Auth gate: `redirect("/sign-in")` if no user; `notFound()` if non-teacher.

### Backend endpoints

| Path | Method | Behavior |
|---|---|---|
| `/api/classes` | GET | List teacher's classes. Query param `?include_archived=true` (default false). Returns `{classes: [{id, name, subject, grade_level, archived, student_count, created_at}, ...]}`. |
| `/api/classes` | POST | Create. Body: `{name, subject?, grade_level?}`. |
| `/api/classes/{id}` | GET | Detail with roster (active members only). Returns archived classes too (UI uses the flag for read-only mode). |
| `/api/classes/{id}` | PATCH | Edit. Body: `{name?, subject?, grade_level?, archived?}` (any subset). `archived: true` sets `deleted_at`; `false` clears it. |
| `/api/classes/{id}/members` | POST | Add students. Body: `{student_ids: [uuid, ...]}`. Idempotent (existing active membership = no-op). Cross-org student → 404. |
| `/api/classes/{id}/members/{student_id}` | DELETE | Remove from class — sets `left_at`. 404 if not active in class. |

All endpoints check `user.role == UserRole.teacher` inline (404 for non-teachers — matches the page-level pattern). Class lookups scope by `(organization_id, teacher_id)` — cross-teacher access returns 404.

### File structure

```
apps/api/src/grade_sight_api/
  routers/classes.py          (new — all 6 endpoints)
  schemas/classes.py          (new — pydantic models)
  main.py                     (modify — register router)

apps/web/
  app/classes/page.tsx                  (new — list)
  app/classes/[id]/page.tsx             (new — detail)
  components/classes/                   (new dir — 14 components, see §4)
  lib/nav.ts                            (modify — add "Classes" tab)
  lib/api.ts                            (modify — add fetchClasses, fetchClassDetail)
  lib/actions.ts                        (modify — 4 new server actions)
  lib/types.ts                          (modify — Klass, ClassDetail, ClassRosterMember)
```

### Schema notes

No migrations needed. All schema is in place from Spec 2:
- `Klass`: id, organization_id (NN), teacher_id (NN FK), name (NN), subject (nullable), grade_level (nullable), TimestampMixin, SoftDeleteMixin.
- `ClassMember`: id, class_id (NN FK), student_id (NN FK), joined_at (NN, default now), left_at (nullable), TenantMixin, TimestampMixin, SoftDeleteMixin. Partial unique on `(class_id, student_id) WHERE left_at IS NULL`.

## 4. Frontend page composition + components

### `/classes/page.tsx`

```tsx
export default async function ClassesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const includeArchived = params.include_archived === "true";

  const [user, classes, hasArchived] = await Promise.all([
    fetchMe(),
    fetchClasses({ includeArchived }),
    fetchHasAnyArchivedClass(),  // tiny separate query so the toggle hides when there's nothing to toggle
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  const isFirstRunEmpty = !includeArchived && classes.length === 0;

  return (
    <AppShell tabs={TEACHER_TABS} activeHref="/classes" uploadHref="/upload"
              orgName={user.organization?.name} userId={user.id}
              organizationId={user.organization?.id ?? null}>
      <PageContainer>
        <ClassListHeader hasArchived={hasArchived} includeArchived={includeArchived} />
        {isFirstRunEmpty
          ? <EmptyClassList />
          : <ClassList classes={classes} />}
      </PageContainer>
    </AppShell>
  );
}
```

(Note: `fetchHasAnyArchivedClass` can be inlined into the existing list endpoint instead — the API can return both the visible classes AND a `has_archived` flag in the same response. Picked separation here for clarity; implementation may merge.)

### `/classes/[id]/page.tsx`

```tsx
export default async function ClassDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail, allStudents] = await Promise.all([
    fetchMe(),
    fetchClassDetail(id),
    fetchStudents(),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();
  if (detail === null) notFound();

  const enrolledIds = new Set(detail.roster.map((m) => m.student_id));
  const candidateStudents = allStudents.filter((s) => !enrolledIds.has(s.id));

  return (
    <AppShell tabs={TEACHER_TABS} activeHref="/classes" uploadHref="/upload"
              orgName={user.organization?.name} userId={user.id}
              organizationId={user.organization?.id ?? null}>
      <PageContainer className="max-w-[1000px]">
        <ClassDetailHeader klass={detail} />
        <RosterSection klass={detail} candidateStudents={candidateStudents} />
      </PageContainer>
    </AppShell>
  );
}
```

### Component inventory (`apps/web/components/classes/`)

| Component | Type | Purpose |
|---|---|---|
| `class-list-header.tsx` | server | Eyebrow + h1 "Classes" + subhead + `<NewClassButton>` + `<ArchivedToggle>` |
| `new-class-button.tsx` | client | "New class" button → opens `<ClassFormDialog mode="create">` |
| `archived-toggle.tsx` | client | URL-bound toggle (`?include_archived=true`); hidden when `hasArchived === false` |
| `class-form-dialog.tsx` | client | Dialog form. Props: `mode: "create" \| "edit"`, `initial?: Klass`. Name + subject (dropdown w/ "Other…" reveal) + grade level. On success: `router.refresh()`. |
| `class-list.tsx` | server | Table: Name · Subject · Grade · Students · ›. Each cell is a `<Link>` → `/classes/[id]` (matches /keys list pattern from Step 13a) |
| `class-row.tsx` | server | One row, all cells linked to detail |
| `empty-class-list.tsx` | server | "No classes yet — create your first" + centered styled card with `<NewClassButton>` |
| `class-detail-header.tsx` | server | Back-link + eyebrow + h1 + subhead + right-side affordances |
| `edit-class-button.tsx` | client | Opens `<ClassFormDialog mode="edit" initial={klass}>`. Hidden on archived classes. |
| `archive-class-button.tsx` | client | `window.confirm(...)` → PATCH `archived: true` → `router.push("/classes")`. Hidden on archived. |
| `unarchive-class-button.tsx` | client | One-click PATCH `archived: false` → `router.refresh()`. Visible only on archived classes. |
| `roster-section.tsx` | server | Eyebrow + h2 + count + `<AddStudentsButton>` (hidden on archived) + `<RosterList>` |
| `roster-list.tsx` | server | List of enrolled students (serif name + grade chip + `<RemoveStudentButton>`). Empty state: "No students yet — add your first." |
| `add-students-button.tsx` | client | Solid button → opens `<AddStudentsDialog>` |
| `add-students-dialog.tsx` | client | Multi-select checkbox list of `candidateStudents`. Submit → POST `/api/classes/{id}/members` → `router.refresh()`. Empty case: link to `/students` to create one first. |
| `remove-student-button.tsx` | client | Subtle text link or `×` icon → `window.confirm(...)` → DELETE → `router.refresh()`. Hidden on archived. |

### Subject "Other…" dropdown handling

```tsx
const SUBJECT_OPTIONS = [
  "Pre-Algebra", "Algebra 1", "Geometry", "Algebra 2",
  "Pre-Calculus", "Calculus", "Statistics", "Other…",
] as const;

// State
const [subject, setSubject] = useState(initial?.subject ?? "");
const [isCustom, setIsCustom] = useState(
  initial?.subject != null && !SUBJECT_OPTIONS.includes(initial.subject as any)
);

// Render
<Select
  value={isCustom ? "Other…" : (subject || undefined)}
  onValueChange={(v) => {
    if (v === "Other…") { setIsCustom(true); setSubject(""); }
    else { setIsCustom(false); setSubject(v); }
  }}
>
  <SelectTrigger><SelectValue placeholder="Subject (optional)" /></SelectTrigger>
  <SelectContent>
    {SUBJECT_OPTIONS.map((opt) => (
      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
    ))}
  </SelectContent>
</Select>

{isCustom && (
  <input
    value={subject}
    onChange={(e) => setSubject(e.target.value)}
    placeholder="e.g., Algebra Zero Period"
  />
)}
```

The "Other…" option is a UI affordance only. The backend stores whatever string ends up in `subject`. Form validation: if `isCustom && subject.trim() === ""`, block submit.

### Server actions (`apps/web/lib/actions.ts`)

```ts
export async function createClass(payload: {
  name: string;
  subject?: string;
  grade_level?: string;
}): Promise<{id: string}> {
  const response = await callApi("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`POST /api/classes failed: ${response.status}`);
  return await response.json() as {id: string};
}

export async function updateClass(id: string, payload: {
  name?: string;
  subject?: string;
  grade_level?: string;
  archived?: boolean;
}): Promise<void> { /* PATCH /api/classes/{id} */ }

export async function addStudentsToClass(
  class_id: string, student_ids: string[],
): Promise<void> { /* POST /api/classes/{id}/members */ }

export async function removeStudentFromClass(
  class_id: string, student_id: string,
): Promise<void> { /* DELETE /api/classes/{id}/members/{student_id} */ }
```

All four follow the established `callApi` pattern from `deleteAnswerKey` / `deleteSelf`.

### Library types (`apps/web/lib/types.ts`)

```ts
export interface Klass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  archived: boolean;
  student_count: number;
  created_at: string;
}

export interface ClassRosterMember {
  id: string;             // ClassMember.id
  student_id: string;
  student_name: string;
  student_grade_level: string | null;
  joined_at: string;
}

export interface ClassDetail {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  archived: boolean;
  roster: ClassRosterMember[];
  created_at: string;
}
```

### Library fetch helpers (`apps/web/lib/api.ts`)

```ts
export async function fetchClasses(opts?: {
  includeArchived?: boolean;
}): Promise<{classes: Klass[]; has_archived: boolean}> { ... }

export async function fetchClassDetail(id: string): Promise<ClassDetail | null> { ... }
```

(`has_archived` is included in the same response — avoids a second round-trip to know whether to show the toggle.)

## 5. Backend endpoints (detail)

### Pydantic schemas (`apps/api/src/grade_sight_api/schemas/classes.py`)

```python
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ClassCreate(BaseModel):
    name: str
    subject: str | None = None
    grade_level: str | None = None


class ClassUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    archived: bool | None = None


class ClassListItem(BaseModel):
    id: UUID
    name: str
    subject: str | None
    grade_level: str | None
    archived: bool
    student_count: int
    created_at: datetime


class ClassListResponse(BaseModel):
    classes: list[ClassListItem]
    has_archived: bool


class ClassRosterMember(BaseModel):
    id: UUID                # ClassMember.id
    student_id: UUID
    student_name: str
    student_grade_level: str | None
    joined_at: datetime


class ClassDetailResponse(BaseModel):
    id: UUID
    name: str
    subject: str | None
    grade_level: str | None
    archived: bool
    roster: list[ClassRosterMember]
    created_at: datetime


class AddMembersRequest(BaseModel):
    student_ids: list[UUID]
```

### Auth + cross-teacher protection helper

```python
async def _get_class_or_404(class_id: UUID, user: User, db: AsyncSession) -> Klass:
    klass = await db.scalar(
        select(Klass).where(
            Klass.id == class_id,
            Klass.organization_id == user.organization_id,
            Klass.teacher_id == user.id,
        )
    )
    if klass is None:
        raise HTTPException(status_code=404, detail="class not found")
    return klass


def _require_teacher(user: User) -> None:
    if user.role != UserRole.teacher:
        raise HTTPException(status_code=404)
```

Both helpers are private to `routers/classes.py`.

### Endpoint sketches

`GET /api/classes`:

```python
@router.get("/api/classes", response_model=ClassListResponse)
async def list_classes(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListResponse:
    _require_teacher(user)

    count_subq = (
        select(
            ClassMember.class_id.label("class_id"),
            func.count(ClassMember.id).label("student_count"),
        )
        .where(
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .group_by(ClassMember.class_id)
        .subquery()
    )

    base_filter = [
        Klass.organization_id == user.organization_id,
        Klass.teacher_id == user.id,
    ]

    stmt = (
        select(Klass, count_subq.c.student_count)
        .outerjoin(count_subq, count_subq.c.class_id == Klass.id)
        .where(*base_filter)
    )
    if not include_archived:
        stmt = stmt.where(Klass.deleted_at.is_(None))
    stmt = stmt.order_by(Klass.created_at.desc())

    rows = (await db.execute(stmt)).all()

    # Has-archived flag: separate quick query so the UI knows to render the toggle
    has_archived_stmt = (
        select(func.count(Klass.id))
        .where(*base_filter, Klass.deleted_at.is_not(None))
    )
    has_archived = (await db.scalar(has_archived_stmt)) > 0

    return ClassListResponse(
        classes=[
            ClassListItem(
                id=k.id,
                name=k.name,
                subject=k.subject,
                grade_level=k.grade_level,
                archived=k.deleted_at is not None,
                student_count=int(count or 0),
                created_at=k.created_at,
            )
            for k, count in rows
        ],
        has_archived=has_archived,
    )
```

`POST /api/classes`:

```python
@router.post("/api/classes", response_model=ClassListItem, status_code=201)
async def create_class(
    payload: ClassCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListItem:
    _require_teacher(user)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    new_class = Klass(
        organization_id=user.organization_id,
        teacher_id=user.id,
        name=name,
        subject=payload.subject,
        grade_level=payload.grade_level,
    )
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)

    return ClassListItem(
        id=new_class.id,
        name=new_class.name,
        subject=new_class.subject,
        grade_level=new_class.grade_level,
        archived=False,
        student_count=0,
        created_at=new_class.created_at,
    )
```

`GET /api/classes/{id}`:

```python
@router.get("/api/classes/{class_id}", response_model=ClassDetailResponse)
async def get_class_detail(
    class_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassDetailResponse:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    roster_stmt = (
        select(ClassMember, Student.full_name, StudentProfile.grade_level)
        .join(Student, ClassMember.student_id == Student.id)
        .outerjoin(StudentProfile, StudentProfile.student_id == Student.id)
        .where(
            ClassMember.class_id == klass.id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .order_by(Student.full_name)
    )
    roster_rows = (await db.execute(roster_stmt)).all()

    return ClassDetailResponse(
        id=klass.id,
        name=klass.name,
        subject=klass.subject,
        grade_level=klass.grade_level,
        archived=klass.deleted_at is not None,
        roster=[
            ClassRosterMember(
                id=m.id,
                student_id=m.student_id,
                student_name=name,
                student_grade_level=grade,
                joined_at=m.joined_at,
            )
            for m, name, grade in roster_rows
        ],
        created_at=klass.created_at,
    )
```

`PATCH /api/classes/{id}`:

```python
@router.patch("/api/classes/{class_id}", response_model=ClassListItem)
async def update_class(
    class_id: UUID,
    payload: ClassUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassListItem:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    fields_to_set: dict[str, object] = {}
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        fields_to_set["name"] = name
    if payload.subject is not None:
        fields_to_set["subject"] = payload.subject
    if payload.grade_level is not None:
        fields_to_set["grade_level"] = payload.grade_level
    if payload.archived is True:
        fields_to_set["deleted_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
    elif payload.archived is False:
        fields_to_set["deleted_at"] = None

    if fields_to_set:
        await db.execute(update(Klass).where(Klass.id == klass.id).values(**fields_to_set))
        await db.commit()
        await db.refresh(klass)

    # Re-compute student_count for the response
    student_count_stmt = (
        select(func.count(ClassMember.id))
        .where(
            ClassMember.class_id == klass.id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
    )
    student_count = await db.scalar(student_count_stmt) or 0

    return ClassListItem(
        id=klass.id,
        name=klass.name,
        subject=klass.subject,
        grade_level=klass.grade_level,
        archived=klass.deleted_at is not None,
        student_count=int(student_count),
        created_at=klass.created_at,
    )
```

`POST /api/classes/{id}/members`:

```python
@router.post("/api/classes/{class_id}/members", response_model=ClassDetailResponse)
async def add_class_members(
    class_id: UUID,
    payload: AddMembersRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ClassDetailResponse:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    if not payload.student_ids:
        return await _detail_response(klass, db)  # no-op

    # Validate student_ids belong to this org
    valid_ids_result = await db.execute(
        select(Student.id).where(
            Student.id.in_(payload.student_ids),
            Student.organization_id == user.organization_id,
            Student.deleted_at.is_(None),
        )
    )
    valid_ids = {row[0] for row in valid_ids_result.all()}

    invalid = set(payload.student_ids) - valid_ids
    if invalid:
        raise HTTPException(
            status_code=404,
            detail=f"Students not found: {sorted(str(i) for i in invalid)}",
        )

    # Idempotency: skip students with existing active membership
    existing_active = await db.execute(
        select(ClassMember.student_id).where(
            ClassMember.class_id == klass.id,
            ClassMember.student_id.in_(valid_ids),
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
    )
    already_active = {row[0] for row in existing_active.all()}

    for sid in valid_ids - already_active:
        db.add(ClassMember(
            class_id=klass.id,
            student_id=sid,
            organization_id=user.organization_id,
        ))
    await db.commit()

    return await _detail_response(klass, db)
```

`DELETE /api/classes/{id}/members/{student_id}`:

```python
@router.delete(
    "/api/classes/{class_id}/members/{student_id}",
    status_code=204,
)
async def remove_class_member(
    class_id: UUID,
    student_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    _require_teacher(user)
    klass = await _get_class_or_404(class_id, user, db)

    result = await db.execute(
        update(ClassMember)
        .where(
            ClassMember.class_id == klass.id,
            ClassMember.student_id == student_id,
            ClassMember.left_at.is_(None),
            ClassMember.deleted_at.is_(None),
        )
        .values(left_at=datetime.now(timezone.utc).replace(tzinfo=None))
        .returning(ClassMember.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="student is not active in this class")

    await db.commit()
```

A `_detail_response(klass, db)` helper builds the `ClassDetailResponse` (used by the `add_class_members` endpoint to return the updated detail).

### Datetime handling

All `deleted_at` / `left_at` / `joined_at` writes use `datetime.now(timezone.utc).replace(tzinfo=None)` per the project's tz-naive column convention (matches Step 13a/13b precedent — `Assessment.uploaded_at`, etc.).

## 6. Tests

### Backend (~22 cases, `apps/api/tests/routers/test_classes_router.py`)

Per endpoint, with cross-org and cross-teacher isolation tested where applicable:

**`GET /api/classes`** (5)
- Returns only the teacher's own classes (cross-teacher: same org, different teacher → not in list)
- Cross-org isolation
- `include_archived=false` excludes archived; `include_archived=true` includes
- `student_count` reflects active members only (excludes left + soft-deleted)
- `has_archived` flag is true when archived classes exist

**`POST /api/classes`** (3)
- Happy path returns new class with `student_count: 0`
- name required (400 if empty/missing)
- subject + grade_level optional (null in response)

**`GET /api/classes/{id}`** (4)
- 404 cross-org
- 404 cross-teacher
- Roster includes student_name + student_grade_level (joined from StudentProfile)
- Archived class returns `archived: true` and full detail

**`PATCH /api/classes/{id}`** (5)
- Update name only / subject only / grade_level only
- `archived: true` sets deleted_at; `archived: false` clears it
- Empty body → 200 unchanged
- Cross-teacher → 404

**`POST /api/classes/{id}/members`** (4)
- Add multiple students; response includes updated roster
- Idempotent (re-adding active member is no-op)
- Cross-org student id → 404
- Re-enroll a student who has `left_at` set → creates new active row (partial unique allows it)

**`DELETE /api/classes/{id}/members/{student_id}`** (3)
- Sets left_at correctly
- 404 if student isn't currently active in the class
- Cross-teacher → 404

### Frontend (vitest)

- `class-form-dialog.test.tsx` (4 tests): "Other…" reveal, name validation, custom-subject validation, edit-mode pre-fill
- `add-students-dialog.test.tsx` (3 tests): candidates filtered, multi-select toggle, empty case shows "create student first" link

### Manual visual verification

1. Tab to `/classes` as teacher → empty state on first visit
2. Click "New class" → dialog → name "Period 4" + subject "Algebra 1" → save → row appears
3. Click row → detail page renders, empty roster
4. "Add students" → dialog → multi-select 3 → save → roster renders with names + grade levels
5. "Remove" on a roster row → confirm → student gone
6. Edit → rename → save → header updates
7. Archive → confirm → redirect to `/classes`, class removed from default view
8. Toggle "Show archived" → class re-appears with archived treatment
9. Click archived class → detail page is read-only (no Edit, Add, Remove — only Unarchive)
10. Unarchive → back to editable
11. As parent, type `/classes` → 404
12. As teacher A, type `/classes/[teacher-B-class-id]` → 404

## 7. Edge cases

| Case | Handling |
|---|---|
| Two students with same name | Each is a separate `Student.id`; UI shows both with full name. No dedup needed. |
| Add a soft-deleted student | Validation rejects via `Student.deleted_at.is_(None)` filter → 404 with offending ids. |
| Concurrent member-add from two browser tabs | Idempotent — second call sees the existing active row and no-ops. |
| Archive a class with active assessments | `assessments.class_id` keeps pointing to the soft-deleted class. Archive doesn't break the FK. |
| Student removed then re-added | Two `class_members` rows: one with `left_at` (historical), one new active. Partial unique allows it. |
| Subject "Other…" with empty write-in | Form validation blocks submit. Backend never sees the literal "Other…" string. |
| Archive on already-archived class | Backend `update` is idempotent (deleted_at stays set); UI redirects to `/classes`. |
| API call against archived class member ops | Permissive in v1 — backend allows it, UI hides the affordances. Captured as followup if it matters. |
| Empty POST body on `add_class_members` | 200, no-op. |
| Class name longer than DB limit | Postgres error → 500. v1 doesn't enforce a UI limit; if it becomes a problem, add maxLength. (Not blocking.) |

## 8. Performance budget

| Endpoint | p95 target |
|---|---|
| `GET /api/classes` (with count subq + has_archived count) | < 100ms |
| `POST /api/classes` | < 50ms |
| `GET /api/classes/{id}` (with roster join) | < 100ms |
| `PATCH /api/classes/{id}` | < 50ms |
| `POST /api/classes/{id}/members` (30 students) | < 200ms |
| `DELETE /api/classes/{id}/members/{student_id}` | < 50ms |

No LLM calls. Single transaction per endpoint. No background jobs.

## 9. Followups created from this spec

To be added to `docs/superpowers/plans/followups.md`:

- **Bulk-paste roster import (Step 13c followup, post-launch).** Real start-of-year flow. Teacher pastes "Marcus Reilly, 9\nJordan Park, 9\n…" and the system creates students + enrolls in one shot. Parsing rules, name dedup against existing students, validation messages — its own brainstorm.
- **`Class` column on `/assessments` archive.** One-line table addition + a JOIN (already in scope since `assessments.class_id` exists). Land the moment 13c merges.
- **Class assignment in `/upload`.** Pairs with Step 13d (bulk-grade workflow). Once classes ship, the upload form should optionally tag the assessment with a class.
- **"Show left students" on roster.** Historical view of who used to be in a class. Not needed first release.
- **Backend gate on archived-class member operations.** v1 is permissive; if it becomes a real issue, return 409.
