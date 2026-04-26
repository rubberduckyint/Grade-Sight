# Lazy-Upsert Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the create-branch of `get_current_user`'s lazy upsert in try/except + best-effort compensating cleanup so a partial failure deletes the Clerk org + Stripe customer that got created before the failure (instead of leaking them as orphan resources).

**Architecture:** New private async helper `_cleanup_partial_lazy_upsert` in `auth/dependencies.py`. Each external delete is independently try/except'd; cleanup-of-cleanup failures log at WARNING with `exc_info=True` and never propagate. The original exception is what surfaces to FastAPI's error handler. The advisory-lock-on-clerk-user-id from Spec 4 stays in place; transaction rollback releases it automatically.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, Anthropic clerk-backend-api SDK, Stripe Python SDK.

---

## Reference Documents

- `docs/superpowers/specs/2026-04-25-lazy-upsert-cleanup-design.md` — the spec
- `apps/api/src/grade_sight_api/auth/dependencies.py` — the file we're modifying
- `apps/api/src/grade_sight_api/services/stripe_service.py` — pattern for `stripe.Customer.delete_async` use

## Pre-merge checklist (every task)

1. `cd apps/api && uv run ruff check` — clean
2. `cd apps/api && uv run mypy src tests` — clean
3. `cd apps/api && uv run pytest -q` — all default tests pass, integration smoke tests skip
4. Commit message: imperative subject, body explaining *why*, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 1: Add `_cleanup_partial_lazy_upsert` helper + wrap create branch

**Files:**
- Modify: `apps/api/src/grade_sight_api/auth/dependencies.py`

This task changes the lazy-upsert behavior. There's no easy unit test for the change itself (the create branch is wired through Clerk + Stripe + DB) — Task 2 adds the failure-path tests. This task's verification is "lint + typecheck pass; the existing test suite still passes; the existing happy-path Spec 4 acceptance behavior is unchanged."

- [ ] **Step 1: Add the `stripe` SDK import + helper function**

In `apps/api/src/grade_sight_api/auth/dependencies.py`, add to the imports block (sorted with the existing imports):

```python
import stripe
```

Add the helper function right after the existing module-level helper functions (after `_plan_for_role` or wherever the file's other private helpers live; preserve the file's existing organization). The function:

```python
async def _cleanup_partial_lazy_upsert(
    *,
    clerk_org_id: str | None,
    stripe_customer_id: str | None,
) -> None:
    """Best-effort cleanup of external resources created during a failed lazy upsert.

    Each delete is independently try/except'd — cleanup-of-cleanup failures log
    at WARNING with exc_info, and never propagate. The caller's original
    exception is what surfaces to FastAPI's error handler.
    """
    if clerk_org_id:
        try:
            clerk_client.organizations.delete(organization_id=clerk_org_id)
        except Exception:
            logger.warning(
                "Lazy upsert cleanup: failed to delete Clerk org %s",
                clerk_org_id,
                exc_info=True,
            )
    if stripe_customer_id:
        try:
            await stripe.Customer.delete_async(stripe_customer_id)
        except Exception:
            logger.warning(
                "Lazy upsert cleanup: failed to delete Stripe customer %s",
                stripe_customer_id,
                exc_info=True,
            )
```

- [ ] **Step 2: Wrap the create branch in try/except**

In `get_current_user`, find the section labeled `# ─── New user: create Clerk org + DB org + Stripe customer + trial sub + user row ───` (currently around line 163) and the existing advisory-lock section that follows. The existing code's create steps are:

1. Create Clerk org (line ~190)
2. Insert organizations row (line ~196)
3. Create Stripe customer (line ~204)
4. Insert subscription row (line ~212)
5. Update org's denormalized status (line ~225)
6. Insert users row (line ~228)

Refactor so that:
- Track `clerk_org_id_for_cleanup: str | None = None` and `stripe_customer_id_for_cleanup: str | None = None` BEFORE the try block.
- Wrap steps 1-6 plus the trailing `await db.flush()` in a `try:` block.
- Set `clerk_org_id_for_cleanup` immediately after the Clerk create call returns its id.
- Set `stripe_customer_id_for_cleanup` immediately after the Stripe customer create returns its id.
- On `except Exception:`, call `await _cleanup_partial_lazy_upsert(clerk_org_id=clerk_org_id_for_cleanup, stripe_customer_id=stripe_customer_id_for_cleanup)` then `raise`.

The full diff for the create branch (replace the existing `# ─── New user...` block plus the steps that follow it) should look like this:

```python
    # ─── New user: create Clerk org + DB org + Stripe customer + trial sub + user row ───

    # Serialize concurrent first-request upserts for the same Clerk user. Without
    # this, parallel requests (e.g. Promise.all on the dashboard) each enter this
    # branch and leak duplicate Clerk orgs + Stripe customers before the users
    # INSERT fails on uq_users_clerk_id. The xact-scoped lock auto-releases on
    # commit/rollback; re-query after acquiring to detect the benign lost-race.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"lazy_upsert:{clerk_user_id}"},
    )
    result = await db.execute(
        select(User).where(
            User.clerk_id == clerk_user_id,
            User.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    unsafe_meta = _extract_unsafe_metadata(clerk_user)
    role = _normalize_role(unsafe_meta.get("role"))
    org_name = _default_org_name(role, first_name, last_name, email)
    plan = _plan_for_role(role)

    # Track which external resources got created, in case we need to clean up.
    clerk_org_id_for_cleanup: str | None = None
    stripe_customer_id_for_cleanup: str | None = None

    try:
        # 1. Create Clerk org (for both parent and teacher now)
        clerk_org = clerk_client.organizations.create(
            request=CreateOrganizationRequestBody(
                name=org_name, created_by=clerk_user_id
            )
        )
        clerk_org_id = getattr(clerk_org, "id", None)
        if clerk_org_id:
            clerk_org_id_for_cleanup = str(clerk_org_id)

        # 2. Insert our organizations row
        new_org = Organization(
            name=org_name,
            clerk_org_id=str(clerk_org_id) if clerk_org_id else None,
        )
        db.add(new_org)
        await db.flush()

        # 3. Create Stripe customer via service layer (writes audit log)
        stripe_customer = await stripe_service.create_customer(
            email=email,
            organization_id=new_org.id,
            db=db,
        )
        stripe_customer_id_for_cleanup = stripe_customer.id

        # 4. Insert subscription row: trialing, 30-day trial, no stripe_subscription_id yet
        trial_ends_at = datetime.now(UTC) + timedelta(days=30)
        new_sub = Subscription(
            organization_id=new_org.id,
            stripe_customer_id=stripe_customer.id,
            stripe_subscription_id=None,
            plan=plan,
            status=SubscriptionStatus.trialing,
            trial_ends_at=trial_ends_at,
            current_period_end=None,
            cancel_at_period_end=False,
        )
        db.add(new_sub)

        # 5. Denormalize subscription status onto organization
        new_org.subscription_status = SubscriptionStatus.trialing

        # 6. Insert users row
        new_user = User(
            clerk_id=clerk_user_id,
            email=email,
            role=role,
            first_name=first_name,
            last_name=last_name,
            organization_id=new_org.id,
        )
        db.add(new_user)
        await db.flush()
    except Exception:
        await _cleanup_partial_lazy_upsert(
            clerk_org_id=clerk_org_id_for_cleanup,
            stripe_customer_id=stripe_customer_id_for_cleanup,
        )
        raise

    logger.info(
        "Lazy upsert created org=%s user=%s role=%s plan=%s",
        new_org.id,
        new_user.id,
        role.value,
        plan.value,
    )
    return new_user
```

The lines `logger.info(...)` and `return new_user` move BELOW the try/except — they only run on the success path.

- [ ] **Step 3: Verify lint + typecheck pass**

```bash
cd apps/api
uv run ruff check
uv run mypy src tests
```

Both must be clean.

- [ ] **Step 4: Verify existing test suite still passes**

```bash
cd apps/api
uv run pytest -q
```

Expected: all default tests still pass (29 pass, 2 integration smoke skip — the same baseline as Spec 5 wrap-up). No regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grade_sight_api/auth/dependencies.py
git commit -m "$(cat <<'EOF'
Wrap lazy-upsert create branch in try/except cleanup

Adds _cleanup_partial_lazy_upsert helper and wraps the New-user create
branch of get_current_user with a try/except that calls it on any
exception. If the Clerk org or Stripe customer got created before the
failure, the cleanup deletes them — closing the orphan-resource gap
surfaced during Spec 4 acceptance.

Each external delete is independently try/except'd in the helper and
logs at WARNING with exc_info; the original exception still surfaces
to FastAPI's error handler. The advisory lock from Spec 4 is xact-
scoped, so transaction rollback auto-releases it.

Failure-path tests follow in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Failure-path unit tests

**Files:**
- Create: `apps/api/tests/auth/__init__.py` (empty, if it doesn't exist)
- Create: `apps/api/tests/auth/test_lazy_upsert_cleanup.py`

The tests mock `clerk_client.organizations`, `stripe.Customer`, and patches the service-layer Stripe customer create. They use the existing `async_session` fixture from `conftest.py`.

- [ ] **Step 1: Create the test file with three failing tests**

Create `apps/api/tests/auth/__init__.py` (zero bytes; only if it doesn't exist already).

Create `apps/api/tests/auth/test_lazy_upsert_cleanup.py`:

```python
"""Failure-path tests for the lazy-upsert cleanup in get_current_user.

These tests cover what happens when one of the external/DB steps in the
"new user" branch fails partway through. The helper _cleanup_partial_lazy_upsert
must run with the right ids and surface the original exception unmasked.
"""

from __future__ import annotations

import logging
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth import dependencies
from grade_sight_api.auth.dependencies import get_current_user


def _fake_clerk_user(
    *,
    user_id: str = "user_test123",
    email: str = "test@example.com",
    role: str = "teacher",
) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.first_name = "Test"
    user.last_name = "User"
    user.email_addresses = [MagicMock(email_address=email)]
    user.unsafe_metadata = {"role": role}
    return user


def _fake_request_with_token(token: str = "valid-jwt") -> MagicMock:
    req = MagicMock()
    req.headers = {"authorization": f"Bearer {token}"}
    return req


def _fake_clerk_org(org_id: str = "org_TEST123") -> MagicMock:
    org = MagicMock()
    org.id = org_id
    return org


@pytest.fixture
def patch_clerk_auth() -> Any:
    """verify_request_auth returns a stable clerk_user_id; no real JWT decode."""
    with patch.object(dependencies, "verify_request_auth", return_value="user_test123"):
        yield


@pytest.fixture
def patch_clerk_user_get() -> Any:
    """clerk_client.users.get returns a fake user."""
    with patch.object(
        dependencies.clerk_client.users, "get", return_value=_fake_clerk_user()
    ):
        yield


async def test_cleanup_runs_when_stripe_create_fails(
    async_session: AsyncSession,
    patch_clerk_auth: None,
    patch_clerk_user_get: None,
) -> None:
    """If stripe_service.create_customer raises, cleanup deletes the Clerk org only."""
    fake_org = _fake_clerk_org("org_CLEANUP_ME")

    with (
        patch.object(
            dependencies.clerk_client.organizations,
            "create",
            return_value=fake_org,
        ),
        patch.object(
            dependencies.clerk_client.organizations,
            "delete",
            return_value=None,
        ) as clerk_delete,
        patch(
            "grade_sight_api.services.stripe_service.create_customer",
            new=AsyncMock(side_effect=RuntimeError("stripe blew up")),
        ),
        patch.object(
            dependencies.stripe.Customer,
            "delete_async",
            new=AsyncMock(return_value=None),
        ) as stripe_delete,
    ):
        with pytest.raises(RuntimeError, match="stripe blew up"):
            await get_current_user(
                request=_fake_request_with_token(), db=async_session
            )

    clerk_delete.assert_called_once_with(organization_id="org_CLEANUP_ME")
    stripe_delete.assert_not_called()


async def test_cleanup_runs_when_user_insert_fails(
    async_session: AsyncSession,
    patch_clerk_auth: None,
    patch_clerk_user_get: None,
) -> None:
    """If the final users INSERT fails, both Clerk org and Stripe customer are cleaned up."""
    fake_org = _fake_clerk_org("org_CLEANUP_BOTH")
    fake_customer = MagicMock()
    fake_customer.id = "cus_CLEANUP_BOTH"

    async def fake_create_customer(*args: Any, **kwargs: Any) -> Any:
        return fake_customer

    # Force the final flush to raise. The cleanest way without coupling to
    # the actual SQL: monkey-patch AsyncSession.flush after the second flush
    # has run (the org INSERT). Easier: cause the user to violate a unique
    # constraint by pre-inserting a row with the same clerk_id.
    from grade_sight_api.models.organization import Organization
    from grade_sight_api.models.subscription import Plan, Subscription, SubscriptionStatus
    from grade_sight_api.models.user import User, UserRole

    pre_org = Organization(name="Pre-existing")
    async_session.add(pre_org)
    await async_session.flush()
    pre_user = User(
        clerk_id="user_test123",  # SAME clerk_id as the fake clerk user → uq violation
        email="other@example.com",
        role=UserRole.parent,
        first_name="Other",
        last_name="User",
        organization_id=pre_org.id,
    )
    async_session.add(pre_user)
    await async_session.flush()
    # Soft-delete the pre-existing user so the get_current_user query
    # for `User.deleted_at.is_(None)` doesn't pick it up — we want
    # the create-branch to run and THEN fail at the final INSERT.
    pre_user.deleted_at = __import__("datetime").datetime.now(
        __import__("datetime").UTC
    )
    await async_session.flush()

    with (
        patch.object(
            dependencies.clerk_client.organizations,
            "create",
            return_value=fake_org,
        ),
        patch.object(
            dependencies.clerk_client.organizations,
            "delete",
            return_value=None,
        ) as clerk_delete,
        patch(
            "grade_sight_api.services.stripe_service.create_customer",
            new=AsyncMock(side_effect=fake_create_customer),
        ),
        patch.object(
            dependencies.stripe.Customer,
            "delete_async",
            new=AsyncMock(return_value=None),
        ) as stripe_delete,
    ):
        with pytest.raises(Exception):  # noqa: B017 — could be IntegrityError or wrapped
            await get_current_user(
                request=_fake_request_with_token(), db=async_session
            )

    clerk_delete.assert_called_once_with(organization_id="org_CLEANUP_BOTH")
    stripe_delete.assert_awaited_once_with("cus_CLEANUP_BOTH")


async def test_cleanup_failure_does_not_mask_original_exception(
    async_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
    patch_clerk_auth: None,
    patch_clerk_user_get: None,
) -> None:
    """If the cleanup-of-cleanup also fails, log a WARNING but surface the original exception."""
    fake_org = _fake_clerk_org("org_CLEANUP_BROKEN")

    with (
        patch.object(
            dependencies.clerk_client.organizations,
            "create",
            return_value=fake_org,
        ),
        patch.object(
            dependencies.clerk_client.organizations,
            "delete",
            side_effect=RuntimeError("clerk delete blew up"),
        ),
        patch(
            "grade_sight_api.services.stripe_service.create_customer",
            new=AsyncMock(side_effect=RuntimeError("stripe blew up")),
        ),
        patch.object(
            dependencies.stripe.Customer,
            "delete_async",
            new=AsyncMock(return_value=None),
        ) as stripe_delete,
        caplog.at_level(logging.WARNING, logger="grade_sight_api.auth.dependencies"),
    ):
        with pytest.raises(RuntimeError, match="stripe blew up"):
            await get_current_user(
                request=_fake_request_with_token(), db=async_session
            )

    assert any(
        "Lazy upsert cleanup: failed to delete Clerk org" in rec.message
        for rec in caplog.records
    ), f"expected cleanup warning in logs, got: {[r.message for r in caplog.records]}"
    # Stripe delete should NOT have been attempted (no customer was created
    # because Stripe customer create was the failure trigger).
    stripe_delete.assert_not_called()
```

- [ ] **Step 2: Run, verify the tests work against the Task 1 implementation**

```bash
cd apps/api
uv run pytest tests/auth/test_lazy_upsert_cleanup.py -v
```

Expected: all 3 tests PASS.

If any test fails, the most likely cause is fixture wiring (the `async_session` fixture rolls back at end-of-test, but mid-test FK constraints could fire). Inspect the error and adjust the test setup; do NOT change Task 1's implementation.

- [ ] **Step 3: Run full test suite + lint + typecheck**

```bash
cd apps/api
uv run pytest -q
uv run ruff check && uv run mypy src tests
```

Expected: 32 pass, 2 skipped (the two integration smoke tests + the new 3 cleanup tests).

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/auth/__init__.py apps/api/tests/auth/test_lazy_upsert_cleanup.py
git commit -m "$(cat <<'EOF'
Add failure-path tests for lazy-upsert cleanup

Three tests cover the realistic failure points: (1) Stripe customer
creation fails after Clerk org succeeds — cleanup deletes Clerk org
only; (2) final users INSERT fails after both externals succeeded —
cleanup deletes both; (3) cleanup-of-cleanup itself fails — WARNING
logged with exc_info, original exception still surfaces unmasked.

The tests mock at the SDK layer (clerk_client.organizations,
stripe.Customer) and at the service-layer wrapper (stripe_service.
create_customer) so we exercise the real lazy-upsert ordering without
hitting any external API.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update CLAUDE.md to mark Spec 6 complete

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit the phase line**

Open `CLAUDE.md` (project root). Find the line currently reading:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), and 5 (external service abstraction layer) complete. Next: diagnostic engine spec (taxonomy must finalize before building).
```

Replace with:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), and 6 (lazy-upsert cleanup) complete. Next: diagnostic engine spec (taxonomy must finalize before building).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Mark Spec 6 (lazy-upsert cleanup) complete in CLAUDE.md

Spec 6 acceptance is done: get_current_user's create branch is wrapped
in try/except + best-effort _cleanup_partial_lazy_upsert. Three
failure-path tests verify the cleanup runs with the right ids and the
original exception always surfaces unmasked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wrap-up

After Task 3, the branch is ready for review.

```bash
cd apps/api
uv run pytest -q
```
Expected: 32 passed, 2 skipped.

```bash
git log --oneline main..<branch>
```
Expected: 3 commits.

Push and merge as Spec 5 was merged (fast-forward to main, then push).

## Out of scope for this plan (deferred)

- **Reordering for process-death resilience** (DB writes first, externals second). Requires schema migration; defer until Railway-restart-mid-signup is observed in production.
- **Background reconciliation job** for orphan resources that escape compensating cleanup. Defer until orphan rate justifies it.
- **Sentry breadcrumb on cleanup failure** — separate observability spec; the WARNING log is the placeholder.
- **One-shot cleanup script** for any pre-Spec-6 orphans still in the dashboards. Manual cleanup during Spec 4 acceptance handled the known set.
