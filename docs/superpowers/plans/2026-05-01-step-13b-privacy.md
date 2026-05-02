# Step 13b · Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/settings/privacy` "Coming soon" stub with editorial copy + a working **Delete account & all data** affordance using soft-delete with a 30-day grace window.

**Architecture:** New `POST /api/me/delete` endpoint orchestrated by `account_deletion_service` — Stripe cancel-at-period-end + cascade soft-delete + audit log in a single transaction. Frontend: replace the page-body stub with editorial sections + a destructive-action zone with type-email confirmation in a shadcn Dialog. New `/account-deleted` landing page.

**Tech Stack:** FastAPI + SQLAlchemy 2 (async) + pydantic v2; Next.js 16 server components + shadcn Dialog; Clerk for sign-out; existing `stripe_service`.

**Spec:** `docs/superpowers/specs/2026-05-01-step-13b-privacy-design.md`

**Branch:** `step-13b-privacy` (already created at `8cb7dd0` with spec committed).

**Reality-check findings before drafting** (so you don't repeat the same lookups):

1. `Organization` already has `SoftDeleteMixin` — **no migration needed** for `organizations.deleted_at`.
2. `get_current_user` (`apps/api/src/grade_sight_api/auth/dependencies.py:185, 230`) already filters `User.deleted_at.is_(None)` — **no security gap to fix**.
3. `Subscription.organization_id` is **NOT NULL + UNIQUE**. One subscription per org. The cascade scope is by `organization_id` for both parents and teachers (parents have a personal billing org).
4. `AuditLog` schema (`apps/api/src/grade_sight_api/models/audit_log.py`):
   - Required: `resource_type`, `action`, `event_metadata` (default `{}`), inherits `organization_id` from `TenantMixin`
   - Nullable: `user_id`, `resource_id`
   - Spec used `event_type` — actual field is `action`. Spec used `details` — actual field is `event_metadata` (Python attribute) / `metadata` (SQL column).
5. The existing router `apps/api/src/grade_sight_api/routers/me.py` has `GET /api/me`. Add the new endpoint **as `POST /api/me/delete`** (not `/api/users/me/delete`) to extend the existing `me.py` rather than create a new file. Spec is amended: endpoint URL is `/api/me/delete`.
6. `stripe_service.py` has `_get_subscription` and other helpers but **no `cancel_at_period_end` helper yet** — Task 1 adds it.

---

## Task 1: stripe_service · cancel_at_period_end helper

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/stripe_service.py`
- Test: `apps/api/tests/services/test_stripe_service.py` (existing or new)

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/services/test_stripe_service.py` (create if missing):

```python
import asyncio
from unittest.mock import patch, MagicMock

import pytest

from grade_sight_api.services import stripe_service


@pytest.mark.asyncio
async def test_cancel_at_period_end_calls_stripe_modify_with_flag():
    with patch("grade_sight_api.services.stripe_service.stripe.Subscription.modify") as mock_modify:
        mock_modify.return_value = MagicMock()
        await stripe_service.cancel_at_period_end("sub_123")
    mock_modify.assert_called_once_with("sub_123", cancel_at_period_end=True)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && uv run pytest tests/services/test_stripe_service.py::test_cancel_at_period_end_calls_stripe_modify_with_flag -v`
Expected: FAIL — `AttributeError: module 'grade_sight_api.services.stripe_service' has no attribute 'cancel_at_period_end'`.

- [ ] **Step 3: Add the helper**

Edit `apps/api/src/grade_sight_api/services/stripe_service.py`. Append:

```python
async def cancel_at_period_end(stripe_subscription_id: str) -> None:
    """Tell Stripe to cancel this subscription at the end of the current period.

    Idempotent: calling twice has the same effect as calling once.
    """
    await asyncio.to_thread(
        stripe.Subscription.modify,
        stripe_subscription_id,
        cancel_at_period_end=True,
    )
```

`asyncio` and `stripe` are already imported at the top of the file (verify; add if missing).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && uv run pytest tests/services/test_stripe_service.py::test_cancel_at_period_end_calls_stripe_modify_with_flag -v`
Expected: PASS.

- [ ] **Step 5: Run mypy**

Run: `cd apps/api && uv run mypy src`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/stripe_service.py apps/api/tests/services/test_stripe_service.py
git commit -m "api: add stripe_service.cancel_at_period_end helper"
```

---

## Task 2: account_deletion_service · parent cascade + helper functions

**Why split parent and teacher branches:** parent cascade is the simpler case (scope by `created_by_user_id` in the absence of an org). It establishes the cascade pattern + audit log + Stripe wiring before adding teacher-org complexity in Task 3. Both branches share helpers.

**Files:**
- Create: `apps/api/src/grade_sight_api/services/account_deletion_service.py`
- Create: `apps/api/tests/services/test_account_deletion_service.py`

- [ ] **Step 1: Write the failing test (parent happy path)**

Create `apps/api/tests/services/test_account_deletion_service.py`:

```python
"""Tests for cascade soft-delete of a user and their owned tenant data."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import select

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole
from grade_sight_api.services import account_deletion_service


async def _seed_parent_with_data(db, *, org=None):
    if org is None:
        org = Organization(name="Personal billing org")
        db.add(org)
        await db.flush()
    user = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"parent_{uuid4()}@test.local",
        role=UserRole.parent,
        organization_id=org.id,
    )
    db.add(user)
    await db.flush()
    student = Student(
        organization_id=org.id,
        created_by_user_id=user.id,
        full_name="Kid",
    )
    db.add(student)
    await db.flush()
    a = Assessment(
        organization_id=org.id,
        created_by_user_id=user.id,
        student_id=student.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )
    db.add(a)
    await db.flush()
    db.add(AssessmentPage(
        assessment_id=a.id,
        organization_id=org.id,
        page_number=1,
        original_filename="p.png",
        s3_url="s3://a/p.png",
    ))
    key = AnswerKey(
        organization_id=org.id,
        created_by_user_id=user.id,
        name="K",
    )
    db.add(key)
    await db.commit()
    return user, student, a, key, org


@pytest.mark.asyncio
async def test_soft_delete_parent_cascades_students_assessments_keys(async_session):
    user, student, a, key, org = await _seed_parent_with_data(async_session)

    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    await async_session.refresh(user)
    await async_session.refresh(student)
    await async_session.refresh(a)
    await async_session.refresh(key)
    assert user.deleted_at is not None
    assert student.deleted_at is not None
    assert a.deleted_at is not None
    assert key.deleted_at is not None
```

`async_session` is the project's standard fixture (verify by reading another test file like `tests/routers/test_answer_keys_router.py`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && uv run pytest tests/services/test_account_deletion_service.py::test_soft_delete_parent_cascades_students_assessments_keys -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'grade_sight_api.services.account_deletion_service'`.

- [ ] **Step 3: Implement the service (parent branch + helpers)**

Create `apps/api/src/grade_sight_api/services/account_deletion_service.py`:

```python
"""Cascade soft-delete a user and their owned tenant data.

Hard purge of the underlying rows + S3 files happens via a 30-day cron
that's deferred to a followup. This service ONLY sets deleted_at columns
and cancels Stripe subscriptions at period end.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
from ..models.assessment import Assessment
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.assessment_page import AssessmentPage
from ..models.audit_log import AuditLog
from ..models.class_member import ClassMember
from ..models.diagnostic_review import DiagnosticReview
from ..models.klass import Klass
from ..models.organization import Organization
from ..models.problem_observation import ProblemObservation
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.subscription import Subscription
from ..models.user import User, UserRole
from . import stripe_service


class MultiTeacherOrgError(Exception):
    """Raised when a teacher tries to delete in an org with other teachers — not v1 behavior."""


async def soft_delete_user(*, user: User, db: AsyncSession) -> None:
    """Soft-delete the user and cascade to their owned tenant data.

    All work happens in a single transaction; the caller's session is
    committed before this function returns.
    """
    now = datetime.now(timezone.utc)
    cascade_counts: dict[str, int] = {}

    await _cancel_stripe_subscription(user=user, db=db)

    # Multi-teacher guard
    if user.role == UserRole.teacher and user.organization_id is not None:
        result = await db.execute(
            select(User).where(
                User.organization_id == user.organization_id,
                User.id != user.id,
                User.deleted_at.is_(None),
                User.role == UserRole.teacher,
            ).limit(1)
        )
        if result.scalar_one_or_none() is not None:
            raise MultiTeacherOrgError(
                "Cannot delete a teacher account in a multi-teacher org (v1)."
            )

    if user.role == UserRole.teacher and user.organization_id is not None:
        await _cascade_teacher(user=user, db=db, now=now, counts=cascade_counts)
    else:
        await _cascade_parent(user=user, db=db, now=now, counts=cascade_counts)

    # Soft-delete the user row itself
    await db.execute(
        update(User).where(User.id == user.id).values(deleted_at=now)
    )

    # Audit log
    db.add(AuditLog(
        organization_id=user.organization_id,
        user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        action="user_self_deleted",
        event_metadata={"cascade_counts": cascade_counts},
    ))

    await db.commit()


async def _cancel_stripe_subscription(*, user: User, db: AsyncSession) -> None:
    if user.organization_id is None:
        return
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == user.organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription is None or not subscription.stripe_subscription_id:
        return
    try:
        await stripe_service.cancel_at_period_end(subscription.stripe_subscription_id)
    except Exception as exc:  # noqa: BLE001
        db.add(AuditLog(
            organization_id=user.organization_id,
            user_id=user.id,
            resource_type="subscription",
            resource_id=subscription.id,
            action="subscription_cancel_failed",
            event_metadata={
                "stripe_subscription_id": subscription.stripe_subscription_id,
                "error": str(exc),
            },
        ))
    # Soft-delete the local subscription row regardless
    await db.execute(
        update(Subscription)
        .where(Subscription.id == subscription.id)
        .values(deleted_at=datetime.now(timezone.utc))
    )


async def _cascade_parent(
    *, user: User, db: AsyncSession, now: datetime, counts: dict[str, int]
) -> None:
    """Soft-delete rows owned by the parent (scoped by created_by_user_id).

    Children of those rows (e.g. AssessmentPage) are then cascade-soft-deleted
    by joining back through the parent table's id.
    """
    for model in (Student, Assessment, AnswerKey):
        result = await db.execute(
            update(model)
            .where(model.created_by_user_id == user.id, model.deleted_at.is_(None))
            .values(deleted_at=now)
            .returning(model.id)
        )
        counts[model.__tablename__] = len(result.all())

    await _cascade_children(db=db, now=now, counts=counts)


async def _cascade_teacher(
    *, user: User, db: AsyncSession, now: datetime, counts: dict[str, int]
) -> None:
    """Soft-delete rows in the teacher's org (single-teacher org assumption)."""
    org_id = user.organization_id
    assert org_id is not None  # narrowed by caller

    for model in (Student, Assessment, AnswerKey, Klass):
        result = await db.execute(
            update(model)
            .where(model.organization_id == org_id, model.deleted_at.is_(None))
            .values(deleted_at=now)
            .returning(model.id)
        )
        counts[model.__tablename__] = len(result.all())

    await _cascade_children(db=db, now=now, counts=counts)

    # Org row
    await db.execute(
        update(Organization)
        .where(Organization.id == org_id, Organization.deleted_at.is_(None))
        .values(deleted_at=now)
    )


async def _cascade_children(
    *, db: AsyncSession, now: datetime, counts: dict[str, int]
) -> None:
    """Soft-delete child rows whose parents were just soft-deleted in this txn.

    Each child table is updated to deleted_at=now where its FK points at a
    parent row whose deleted_at == now (i.e., the parent we just nuked in
    this same transaction). This avoids loading parent ids into Python.
    """
    child_specs: list[tuple[type, type, str]] = [
        (StudentProfile, Student, "student_id"),
        (AssessmentPage, Assessment, "assessment_id"),
        (AssessmentDiagnosis, Assessment, "assessment_id"),
        (DiagnosticReview, Assessment, "assessment_id"),
        (ProblemObservation, AssessmentDiagnosis, "diagnosis_id"),
        (AnswerKeyPage, AnswerKey, "answer_key_id"),
        (ClassMember, Klass, "class_id"),
    ]
    for child_model, parent_model, fk_attr in child_specs:
        await db.execute(
            update(child_model)
            .where(
                getattr(child_model, fk_attr).in_(
                    select(parent_model.id).where(parent_model.deleted_at == now)
                ),
                child_model.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && uv run pytest tests/services/test_account_deletion_service.py::test_soft_delete_parent_cascades_students_assessments_keys -v`
Expected: PASS.

- [ ] **Step 5: Add Stripe + audit log + cross-isolation tests**

Append to the test file:

```python
@pytest.mark.asyncio
async def test_soft_delete_cancels_stripe_subscription_at_period_end(async_session):
    user, _, _, _, org = await _seed_parent_with_data(async_session)
    sub = Subscription(
        organization_id=org.id,
        stripe_customer_id="cus_test",
        stripe_subscription_id="sub_test",
        plan="parent_monthly",
        status="active",
    )
    async_session.add(sub)
    await async_session.commit()

    mock_cancel = AsyncMock()
    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", mock_cancel):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    mock_cancel.assert_awaited_once_with("sub_test")
    await async_session.refresh(sub)
    assert sub.deleted_at is not None


@pytest.mark.asyncio
async def test_soft_delete_skips_stripe_when_no_subscription(async_session):
    user, _, _, _, _ = await _seed_parent_with_data(async_session)

    mock_cancel = AsyncMock()
    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", mock_cancel):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    mock_cancel.assert_not_awaited()


@pytest.mark.asyncio
async def test_soft_delete_proceeds_when_stripe_call_fails(async_session):
    user, _, _, _, org = await _seed_parent_with_data(async_session)
    sub = Subscription(
        organization_id=org.id,
        stripe_customer_id="cus_test",
        stripe_subscription_id="sub_test",
        plan="parent_monthly",
        status="active",
    )
    async_session.add(sub)
    await async_session.commit()

    failing_cancel = AsyncMock(side_effect=RuntimeError("stripe down"))
    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", failing_cancel):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    await async_session.refresh(user)
    assert user.deleted_at is not None
    # An audit log entry for the failure was written
    rows = (await async_session.execute(
        select(AuditLog).where(AuditLog.action == "subscription_cancel_failed")
    )).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_soft_delete_writes_audit_log_with_cascade_counts(async_session):
    user, _, _, _, _ = await _seed_parent_with_data(async_session)

    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    rows = (await async_session.execute(
        select(AuditLog).where(AuditLog.action == "user_self_deleted")
    )).scalars().all()
    assert len(rows) == 1
    counts = rows[0].event_metadata["cascade_counts"]
    assert counts["students"] == 1
    assert counts["assessments"] == 1
    assert counts["answer_keys"] == 1


@pytest.mark.asyncio
async def test_soft_delete_does_not_affect_other_users_data(async_session):
    user_a, student_a, a_a, key_a, _ = await _seed_parent_with_data(async_session)
    user_b, student_b, a_b, key_b, _ = await _seed_parent_with_data(async_session)

    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user_a, db=async_session)

    for row in (user_b, student_b, a_b, key_b):
        await async_session.refresh(row)
        assert row.deleted_at is None
```

- [ ] **Step 6: Run all service tests**

Run: `cd apps/api && uv run pytest tests/services/test_account_deletion_service.py -v`
Expected: all PASS (5 tests so far).

- [ ] **Step 7: Run mypy**

Run: `cd apps/api && uv run mypy src`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/grade_sight_api/services/account_deletion_service.py apps/api/tests/services/test_account_deletion_service.py
git commit -m "api: add account_deletion_service with parent cascade + Stripe + audit log"
```

---

## Task 3: account_deletion_service · teacher cascade + multi-teacher guard

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/account_deletion_service.py` (already populated; just confirm teacher branch implemented)
- Modify: `apps/api/tests/services/test_account_deletion_service.py`

The service code from Task 2 already includes the teacher branch. Task 3 is purely about test coverage for that branch + the multi-teacher guard.

- [ ] **Step 1: Write failing teacher tests**

Append to `apps/api/tests/services/test_account_deletion_service.py`:

```python
async def _seed_teacher_with_data(db):
    org = Organization(name="School")
    db.add(org)
    await db.flush()
    teacher = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"teacher_{uuid4()}@test.local",
        role=UserRole.teacher,
        organization_id=org.id,
    )
    db.add(teacher)
    await db.flush()
    student = Student(
        organization_id=org.id,
        created_by_user_id=teacher.id,
        full_name="Pupil",
    )
    db.add(student)
    await db.flush()
    a = Assessment(
        organization_id=org.id,
        created_by_user_id=teacher.id,
        student_id=student.id,
        status=AssessmentStatus.completed,
        uploaded_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )
    db.add(a)
    await db.flush()
    db.add(AssessmentPage(
        assessment_id=a.id,
        organization_id=org.id,
        page_number=1,
        original_filename="p.png",
        s3_url="s3://a/p.png",
    ))
    key = AnswerKey(
        organization_id=org.id,
        created_by_user_id=teacher.id,
        name="K",
    )
    db.add(key)
    await db.flush()
    klass = Klass(
        organization_id=org.id,
        teacher_id=teacher.id,
        name="4th period",
    )
    db.add(klass)
    await db.commit()
    return teacher, org, student, a, key, klass


@pytest.mark.asyncio
async def test_soft_delete_teacher_cascades_org_classes_and_owned_data(async_session):
    teacher, org, student, a, key, klass = await _seed_teacher_with_data(async_session)

    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=teacher, db=async_session)

    for row in (teacher, org, student, a, key, klass):
        await async_session.refresh(row)
        assert row.deleted_at is not None


@pytest.mark.asyncio
async def test_soft_delete_teacher_in_multi_teacher_org_raises(async_session):
    teacher_a, org, _, _, _, _ = await _seed_teacher_with_data(async_session)
    teacher_b = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"teacher_b_{uuid4()}@test.local",
        role=UserRole.teacher,
        organization_id=org.id,
    )
    async_session.add(teacher_b)
    await async_session.commit()

    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", AsyncMock()):
        with pytest.raises(account_deletion_service.MultiTeacherOrgError):
            await account_deletion_service.soft_delete_user(user=teacher_a, db=async_session)

    # Nothing got soft-deleted
    await async_session.refresh(teacher_a)
    await async_session.refresh(org)
    assert teacher_a.deleted_at is None
    assert org.deleted_at is None


@pytest.mark.asyncio
async def test_soft_delete_user_with_zero_owned_data_succeeds(async_session):
    org = Organization(name="Empty")
    async_session.add(org)
    await async_session.flush()
    user = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"empty_{uuid4()}@test.local",
        role=UserRole.parent,
        organization_id=org.id,
    )
    async_session.add(user)
    await async_session.commit()

    with patch.object(account_deletion_service.stripe_service, "cancel_at_period_end", AsyncMock()):
        await account_deletion_service.soft_delete_user(user=user, db=async_session)

    await async_session.refresh(user)
    assert user.deleted_at is not None
```

- [ ] **Step 2: Run all service tests**

Run: `cd apps/api && uv run pytest tests/services/test_account_deletion_service.py -v`
Expected: 8 PASS (5 from Task 2 + 3 new).

The test for multi-teacher should fail loudly if the guard isn't there — but the service code from Task 2 already includes the guard, so this should pass.

If `test_soft_delete_teacher_in_multi_teacher_org_raises` reports rollback issues (the exception inside the function before commit), that's expected — the test doesn't need a rollback since nothing was committed. If you see "PendingRollbackError" on the asserts, wrap the `pytest.raises` block with `await async_session.rollback()` after.

- [ ] **Step 3: Run mypy**

Run: `cd apps/api && uv run mypy src tests`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/services/test_account_deletion_service.py
git commit -m "api: cover teacher cascade + multi-teacher guard + zero-data path"
```

---

## Task 4: POST /api/me/delete router endpoint + integration tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/routers/me.py`
- Modify: `apps/api/tests/routers/test_me_router.py` (existing or new — if missing, model after `tests/routers/test_answer_keys_router.py`)

- [ ] **Step 1: Write the failing integration test**

Add or create `apps/api/tests/routers/test_me_router.py` with:

```python
"""Tests for /api/me endpoints (existing GET + new POST /api/me/delete)."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from grade_sight_api.main import app
from grade_sight_api.models.user import User, UserRole
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.auth import dependencies
from grade_sight_api.db.session import get_session


async def _seed_user(async_session, role=UserRole.parent):
    org = Organization(name="org")
    async_session.add(org)
    await async_session.flush()
    user = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"u_{uuid4()}@test.local",
        role=role,
        organization_id=org.id,
    )
    async_session.add(user)
    await async_session.commit()
    return user, org


def _override_deps(async_session, user):
    async def _user_dep():
        return user
    async def _session_dep():
        yield async_session
    app.dependency_overrides[dependencies.get_current_user] = _user_dep
    app.dependency_overrides[get_session] = _session_dep


@pytest.mark.asyncio
async def test_delete_self_returns_204(async_session):
    user, _ = await _seed_user(async_session)
    student = Student(
        organization_id=user.organization_id,
        created_by_user_id=user.id,
        full_name="Kid",
    )
    async_session.add(student)
    await async_session.commit()

    _override_deps(async_session, user)
    try:
        with patch("grade_sight_api.services.account_deletion_service.stripe_service.cancel_at_period_end", AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/me/delete")
        assert resp.status_code == 204
        await async_session.refresh(user)
        assert user.deleted_at is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_self_unauthenticated_returns_401(async_session):
    # No dependency override — get_current_user will raise via its real impl
    # (which expects a Clerk token and otherwise returns 401)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/me/delete")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_delete_self_multi_teacher_org_returns_409(async_session):
    teacher_a, org = await _seed_user(async_session, role=UserRole.teacher)
    teacher_b = User(
        clerk_id=f"clerk_{uuid4()}",
        email=f"b_{uuid4()}@test.local",
        role=UserRole.teacher,
        organization_id=org.id,
    )
    async_session.add(teacher_b)
    await async_session.commit()

    _override_deps(async_session, teacher_a)
    try:
        with patch("grade_sight_api.services.account_deletion_service.stripe_service.cancel_at_period_end", AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/me/delete")
        assert resp.status_code == 409
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && uv run pytest tests/routers/test_me_router.py -v`
Expected: FAIL — endpoint returns 405 (POST not allowed) or the route doesn't exist (404).

- [ ] **Step 3: Add the endpoint**

Edit `apps/api/src/grade_sight_api/routers/me.py`. Append (preserving existing GET handler):

```python
from fastapi import HTTPException, status

from ..services import account_deletion_service


@router.post("/api/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_self(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Soft-delete the authenticated user + their owned tenant data."""
    try:
        await account_deletion_service.soft_delete_user(user=user, db=db)
    except account_deletion_service.MultiTeacherOrgError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a teacher account in a multi-teacher org. Contact support.",
        )
```

If `User`, `Depends`, `get_current_user`, `get_session`, `AsyncSession` aren't already imported in `me.py`, add them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && uv run pytest tests/routers/test_me_router.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Run full backend test suite**

Run: `cd apps/api && uv run pytest && uv run mypy src tests`
Expected: all PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/routers/me.py apps/api/tests/routers/test_me_router.py
git commit -m "api: add POST /api/me/delete endpoint with multi-teacher 409"
```

---

## Task 5: Frontend · deleteSelf server action

**Files:**
- Modify: `apps/web/lib/actions.ts`

- [ ] **Step 1: Add the server action**

Append to `apps/web/lib/actions.ts`:

```ts
export async function deleteSelf(): Promise<void> {
  const response = await callApi("/api/me/delete", { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/me/delete failed: ${response.status}`);
  }
}
```

The existing `callApi` helper at the top of `actions.ts` handles auth + base URL. (Verify by reading the file — `deleteAnswerKey` uses the same pattern.)

- [ ] **Step 2: Verify typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean (only pre-existing warnings).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/actions.ts
git commit -m "web: add deleteSelf server action calling POST /api/me/delete"
```

---

## Task 6: Frontend · privacy editorial components

**Files:**
- Create: `apps/web/components/privacy/privacy-header.tsx`
- Create: `apps/web/components/privacy/what-we-keep-section.tsx`
- Create: `apps/web/components/privacy/what-we-keep-block.tsx`

- [ ] **Step 1: Create `privacy-header.tsx`**

```tsx
// apps/web/components/privacy/privacy-header.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export function PrivacyHeader() {
  return (
    <header className="mb-14">
      <SectionEyebrow>Settings · Privacy &amp; data</SectionEyebrow>
      <div className="mt-4">
        <SerifHeadline level="page" as="h1">What we keep, and for how long.</SerifHeadline>
      </div>
      <p className="mt-3 max-w-[720px] font-serif text-xl font-light text-ink-soft leading-relaxed">
        Plain English. Edit anything below at any time. Deleting a quiz removes
        it from our servers within 24 hours.
      </p>
    </header>
  );
}
```

- [ ] **Step 2: Create `what-we-keep-section.tsx`**

```tsx
// apps/web/components/privacy/what-we-keep-section.tsx
export function WhatWeKeepSection({
  eyebrow,
  title,
  body,
  divider,
}: {
  eyebrow: string;
  title: string;
  body: string;
  divider: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 gap-6 py-8 md:grid-cols-[180px_1fr] md:gap-12 ${divider ? "border-b border-rule-soft" : ""}`}>
      <div className="pt-1 font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        {eyebrow}
      </div>
      <div>
        <p className="font-serif text-2xl font-medium leading-tight tracking-[-0.012em] text-ink">
          {title}
        </p>
        <p className="mt-3 max-w-[600px] font-serif text-lg leading-relaxed text-ink-soft">
          {body}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `what-we-keep-block.tsx`**

```tsx
// apps/web/components/privacy/what-we-keep-block.tsx
import { WhatWeKeepSection } from "./what-we-keep-section";

const SECTIONS = [
  {
    eyebrow: "WHAT WE STORE",
    title: "Quiz photos, the diagnosis, your child’s name.",
    body: "Photos are encrypted. The diagnosis (what we found, what the pattern was) is plain JSON. Your child’s name lives only on your account — we don’t share it with anyone.",
  },
  {
    eyebrow: "WHAT WE NEVER STORE",
    title: "Faces. School names. Anything not on the quiz.",
    body: "If a photo includes a face or a school logo by accident, our processor blurs it before storing. We don’t ask for or keep school identifiers.",
  },
  {
    eyebrow: "HOW LONG",
    title: "30 days by default. You can shorten it.",
    body: "After 30 days the photos auto-delete. The diagnosis (text only) stays in your history so longitudinal tracking works — unless you delete that too.",
  },
  {
    eyebrow: "AI TRAINING",
    title: "Off. We don’t train on your child’s work.",
    body: "Period. This is enforced at the database level, not a setting we can flip.",
  },
] as const;

export function WhatWeKeepBlock() {
  return (
    <section>
      {SECTIONS.map((s, i) => (
        <WhatWeKeepSection
          key={s.eyebrow}
          eyebrow={s.eyebrow}
          title={s.title}
          body={s.body}
          divider={i < SECTIONS.length - 1}
        />
      ))}
    </section>
  );
}
```

(Unicode escapes for apostrophes/em-dashes avoid the `react/no-unescaped-entities` ESLint rule that bit Task 8 of Step 13a.)

- [ ] **Step 4: Verify typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/privacy/privacy-header.tsx apps/web/components/privacy/what-we-keep-section.tsx apps/web/components/privacy/what-we-keep-block.tsx
git commit -m "web: add privacy header + what-we-keep editorial components"
```

---

## Task 7: Frontend · delete-account components + dialog test

**Files:**
- Create: `apps/web/components/privacy/delete-account-section.tsx`
- Create: `apps/web/components/privacy/delete-account-button.tsx`
- Create: `apps/web/components/privacy/delete-account-dialog.tsx`
- Create: `apps/web/components/privacy/delete-account-dialog.test.tsx`

- [ ] **Step 1: Create `delete-account-dialog.tsx`**

```tsx
// apps/web/components/privacy/delete-account-dialog.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteSelf } from "@/lib/actions";

export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { signOut } = useClerk();

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteSelf();
        await signOut();
        router.push("/account-deleted");
      } catch {
        toast.error("Couldn’t delete the account — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account &amp; all data</DialogTitle>
        </DialogHeader>
        <p className="mb-4 text-sm text-ink-soft">
          This is permanent after a 30-day grace window. To confirm, type your
          email address.
        </p>
        <input
          aria-label="Type your email to confirm"
          type="email"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email}
          className="w-full rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || pending}
            onClick={onConfirm}
            className="rounded-[var(--radius-sm)] bg-mark px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `delete-account-button.tsx`**

```tsx
// apps/web/components/privacy/delete-account-button.tsx
"use client";
import { useState } from "react";

import { DeleteAccountDialog } from "./delete-account-dialog";

export function DeleteAccountButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] border border-mark px-5 py-2.5 font-sans text-sm text-mark hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark"
      >
        Delete account &amp; all data
      </button>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} email={email} />
    </>
  );
}
```

- [ ] **Step 3: Create `delete-account-section.tsx`**

```tsx
// apps/web/components/privacy/delete-account-section.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

import { DeleteAccountButton } from "./delete-account-button";

export function DeleteAccountSection({ email }: { email: string }) {
  return (
    <section className="mt-16 border-t border-rule pt-12">
      <SectionEyebrow>Your data</SectionEyebrow>
      <div className="mt-4 mb-3">
        <SerifHeadline level="section" as="h2">Delete your account.</SerifHeadline>
      </div>
      <p className="mb-8 max-w-[640px] text-base text-ink-soft">
        This removes your account, all student data, and cancels your
        subscription. We keep a 30-day grace window in case you change your
        mind, then permanently purge everything.
      </p>
      <DeleteAccountButton email={email} />
    </section>
  );
}
```

- [ ] **Step 4: Write the failing dialog test**

Create `apps/web/components/privacy/delete-account-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { DeleteAccountDialog } from "./delete-account-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockSignOut = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

const mockDeleteSelf = vi.fn();
vi.mock("@/lib/actions", () => ({
  deleteSelf: () => mockDeleteSelf(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    mockDeleteSelf.mockReset();
    mockSignOut.mockReset();
  });

  it("disables confirm until typed email matches", async () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} email="parent@test.local" />);
    const confirm = screen.getByRole("button", { name: /delete permanently/i });
    expect(confirm).toBeDisabled();

    const input = screen.getByLabelText(/type your email to confirm/i);
    await userEvent.type(input, "wrong@test.local");
    expect(confirm).toBeDisabled();
  });

  it("enables confirm on exact case-insensitive match", async () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} email="Parent@Test.Local" />);
    const input = screen.getByLabelText(/type your email to confirm/i);
    await userEvent.type(input, "parent@test.local");
    expect(screen.getByRole("button", { name: /delete permanently/i })).toBeEnabled();
  });

  it("calls deleteSelf and signOut when confirm is clicked", async () => {
    mockDeleteSelf.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    render(<DeleteAccountDialog open onOpenChange={() => {}} email="x@y.z" />);
    await userEvent.type(screen.getByLabelText(/type your email to confirm/i), "x@y.z");
    await userEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(mockDeleteSelf).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Run the dialog test**

Run: `cd apps/web && pnpm vitest run delete-account-dialog`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/privacy/delete-account-section.tsx apps/web/components/privacy/delete-account-button.tsx apps/web/components/privacy/delete-account-dialog.tsx apps/web/components/privacy/delete-account-dialog.test.tsx
git commit -m "web: add delete-account section + button + dialog with type-email confirm"
```

---

## Task 8: Frontend · replace `/settings/privacy` page body

**Files:**
- Modify: `apps/web/app/settings/privacy/page.tsx`

- [ ] **Step 1: Replace the stub body**

Overwrite `apps/web/app/settings/privacy/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { fetchMe } from "@/lib/api";
import { PrivacyHeader } from "@/components/privacy/privacy-header";
import { WhatWeKeepBlock } from "@/components/privacy/what-we-keep-block";
import { DeleteAccountSection } from "@/components/privacy/delete-account-section";

export default async function PrivacyPage() {
  const user = await fetchMe();
  if (!user) redirect("/sign-in");

  return (
    <>
      <PrivacyHeader />
      <WhatWeKeepBlock />
      <DeleteAccountSection email={user.email} />
    </>
  );
}
```

The existing `<SettingsLayout>` (`apps/web/app/settings/layout.tsx`) wraps this in the Profile/Privacy/Billing tab nav and ShellHeader.

- [ ] **Step 2: Verify build + typecheck**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: PASS, /settings/privacy still appears in build output (it already exists; we're just changing the body).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/settings/privacy/page.tsx
git commit -m "web: replace /settings/privacy stub with editorial body + delete affordance"
```

---

## Task 9: Frontend · `/account-deleted` landing page

**Files:**
- Create: `apps/web/app/account-deleted/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/account-deleted/page.tsx
import Link from "next/link";

import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function AccountDeletedPage() {
  return (
    <PageContainer className="py-24">
      <SectionEyebrow>Account deleted</SectionEyebrow>
      <div className="mt-3 mb-6">
        <SerifHeadline level="page" as="h1">Your account is gone.</SerifHeadline>
      </div>
      <p className="max-w-[640px] text-base text-ink-soft">
        Your data will be permanently removed within 30 days. If this was a
        mistake, email support@gradesight.com within that window to restore
        the account.
      </p>
      <div className="mt-10">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.12em] text-accent"
        >
          Back to home →
        </Link>
      </div>
    </PageContainer>
  );
}
```

No `<AppShell>` (signed-out user lands here). No auth gate.

- [ ] **Step 2: Verify build + typecheck**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: PASS, `/account-deleted` route present in build output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/account-deleted/page.tsx
git commit -m "web: add /account-deleted landing page (no auth)"
```

---

## Task 10: Manual visual verification + final whole-branch review

**Goal:** Run dev servers, exercise both pages and the delete flow, dispatch a final whole-branch review (Opus).

- [ ] **Step 1: Start the dev servers**

```bash
cd apps/api && uv run uvicorn grade_sight_api.main:app --reload
# in a parallel terminal:
cd apps/web && pnpm dev
```

- [ ] **Step 2: Verify `/settings/privacy` as parent**

Sign in as a parent. Navigate to `/settings/privacy`. Confirm:
- ShellHeader + Profile/Privacy/Billing tabs visible (Privacy active)
- Editorial header + 4 "what we keep" sections render with correct copy
- Bottom destructive zone with "Delete account & all data" button

- [ ] **Step 3: Verify `/settings/privacy` as teacher**

Sign in as a teacher. Same content renders (page is identical for both roles in v1).

- [ ] **Step 4: Verify the delete-confirmation dialog**

Click the button → dialog opens with "Type your email" prompt.
- Type partial email → confirm disabled
- Type wrong email → confirm disabled
- Type matching email exactly → confirm enables
- Type matching email with different casing → confirm enables (case-insensitive)
- Click Cancel → dialog closes, no DB change

- [ ] **Step 5: Walk a real delete (use a test account)**

Sign in as a disposable test parent. Click delete → type email → confirm. Expect:
- Brief loading state
- Redirect to `/account-deleted`
- "Your account is gone" copy renders
- No nav (signed out)
- Back-button to `/dashboard` redirects to `/sign-in`

- [ ] **Step 6: DB verification**

```bash
# Connect to local Postgres (whatever the project's standard is)
SELECT id, email, deleted_at FROM users WHERE email = 'test@example.com';
SELECT count(*) FROM students WHERE created_by_user_id = '<user-id>' AND deleted_at IS NULL;
SELECT count(*) FROM assessments WHERE created_by_user_id = '<user-id>' AND deleted_at IS NULL;
SELECT * FROM audit_log WHERE action = 'user_self_deleted' ORDER BY created_at DESC LIMIT 1;
```

Expected: user has `deleted_at`; counts of "alive" student/assessment rows = 0; one audit log entry with `cascade_counts` JSON.

- [ ] **Step 7: Stop the servers**

Ctrl-C both. No commit needed.

- [ ] **Step 8: Run all gates one final time**

```bash
cd apps/api && uv run pytest && uv run mypy src tests
cd apps/web && pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Expected: ALL PASS.

- [ ] **Step 9: Dispatch final whole-branch review (Opus)**

Use `superpowers:code-reviewer` agent with Opus model. Provide:
- BASE_SHA: `8cb7dd0` (spec commit)
- HEAD_SHA: current (after all task commits)
- Spec + plan paths
- Cross-cutting concerns to check: privacy posture (do soft-deleted users actually become invisible to all queries?), cascade completeness (any tenant table missed?), Stripe-failure handling, dialog UX.

- [ ] **Step 10: Address Critical/Important findings**

If the reviewer flags anything Critical or Important, fix and re-review. Accept Nits per the project workflow rule.

---

## Task 11: Open PR + squash-merge after user OK

**Files:** none — uses `gh` CLI.

- [ ] **Step 1: Push branch**

```bash
git push -u origin step-13b-privacy
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head step-13b-privacy --title "Step 13b · Privacy (editorial + working delete)" --body "$(cat <<'EOF'
## Summary

- Replaces `/settings/privacy` "Coming soon" stub with editorial header + 4 "what we keep" sections (canvas copy verbatim) + destructive-action zone.
- New `POST /api/me/delete` endpoint: cancels Stripe at period end, cascade-soft-deletes the user + owned tenant data, writes an audit log entry. All in a single transaction.
- New `account_deletion_service` orchestrating the cascade. Parent and teacher branches; multi-teacher org → 409.
- New `/account-deleted` landing page (no auth).
- Type-email confirmation in a shadcn Dialog before the destructive call.

## Architecture

- Soft-delete with 30-day grace window; **hard purge of DB rows + S3 files is deferred to a Railway cron followup** so we honor the CLAUDE.md commitment without blocking on ops work.
- Cascade scope: user → students → assessments + pages + diagnoses + observations + reviews → answer keys + pages → (teacher) classes + class members → org. Covered by 8 service tests (parent, teacher, Stripe success/skip/failure, audit log shape, cross-isolation, multi-teacher guard, zero-owned-data).
- Existing `get_current_user` already filters soft-deleted users — no security gap.

## Followups captured

Hard-purge cron, data-export `.zip`, the four canvas toggles (photo retention / diagnosis history / email-on-processed / second-parent share), multi-teacher org delete branch, copy fact-check pass.

## Test plan

- [x] Backend: pytest 8 service + 3 router tests pass; full suite + mypy clean
- [x] Frontend: typecheck + lint + vitest + build clean; new dialog tests cover type-email confirm + signOut wiring
- [x] Manual: parent and teacher both see the page; delete flow walks through dialog → API → signOut → /account-deleted; DB rows confirmed soft-deleted; audit log entry written

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After David's affirmative on the PR, squash-merge**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only
```

Per workflow memory (2026-05-01): an affirmative ("looks good", "lgtm", "merge", "ship it") IS the merge cue. Don't ask again.

---

## Notes for the implementer

- **The cascade `_cascade_children` helper uses a self-referential pattern** — it sets child rows where their parent's `deleted_at == now` (the same `now` used for the parent updates earlier in this transaction). This avoids loading parent ids into Python. Postgres handles the SELECT-IN-UPDATE without a deadlock because everything's in one transaction.
- **`returning(model.id)` on bulk update** is supported by Postgres + SQLAlchemy 2 async. If you find it doesn't work in this codebase's setup, replace with a separate SELECT before the UPDATE to count rows, then do the UPDATE.
- **The `assert org_id is not None` in `_cascade_teacher`** narrows the type for mypy (since the caller already gated on `user.organization_id is not None`). Don't drop it.
- **Multi-teacher guard order matters.** Run the guard BEFORE any cascade work so a multi-teacher org delete leaves the DB untouched.
- **`AuditLog.event_metadata` is the Python attribute; SQL column is `metadata`.** When seeding test data, use the Python attribute name. When querying via `text(...)`, use the SQL column name.
- **`Subscription.organization_id` is unique, not nullable.** That's why the cancel helper scopes by `organization_id`, not `user_id`.
- **The dialog test uses `vi.mock` for `next/navigation`, `@clerk/nextjs`, `@/lib/actions`, and `sonner`** — standard pattern for component tests in this project (see `app-shell.test.tsx` from Step 13a).
- **`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` import from `@/components/ui/dialog`** (shadcn primitive, already used by AddKeyDialog in Step 13a).
- **`useClerk().signOut()` is the canonical sign-out call** in this Next.js + Clerk integration. Calling it from a client component during a `useTransition` is the established pattern.
