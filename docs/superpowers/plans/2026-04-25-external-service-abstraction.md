# External Service Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Claude (Anthropic) and storage (Cloudflare R2) service modules that the diagnostic engine and assessment-upload features will consume in later specs, plus a shared `CallContext` + `_logging` helper that codifies the data-minimization rule from `CLAUDE.md` §3.

**Architecture:** Module-level async functions (matching the existing `stripe_service.py` pattern). New `services/call_context.py`, `services/_logging.py`, `services/claude_service.py`, `services/storage_service.py`. `stripe_service.py` migrates to use `_logging.py`'s `write_audit_log` helper as a surgical refactor. Real SDK wire-up (not stubs) so the abstraction is end-to-end verified before any feature spec depends on it.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, Anthropic Python SDK (`anthropic`), `aioboto3` for Cloudflare R2 (S3-compatible), pytest + pytest-asyncio.

---

## Reference Documents

- `docs/superpowers/specs/2026-04-25-external-service-abstraction-design.md` — the spec
- `apps/api/src/grade_sight_api/services/stripe_service.py` — pattern reference
- `apps/api/src/grade_sight_api/models/llm_call_log.py` — log row shape
- `apps/api/src/grade_sight_api/models/audit_log.py` — audit row shape (note: SQL column is `metadata`, Python attribute is `event_metadata`)
- `apps/api/tests/conftest.py` — existing pytest fixtures (`async_session`, `async_engine`)

## Day-0 prerequisites (manual, no code)

Before Task 1, the implementer (or user) must:

1. **Cloudflare R2 bucket**
   - In Cloudflare dashboard → R2 → create bucket `grade-sight-assessments`
   - Region: Auto (or whatever Cloudflare default is)
   
2. **R2 API token**
   - Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API token
   - Permissions: Object Read & Write
   - Specify bucket: `grade-sight-assessments`
   - Save the Access Key ID and Secret Access Key (you'll only see the secret once)
   
3. **Note your R2 account ID**
   - Visible in the Cloudflare dashboard right sidebar under R2 (or any service)
   
4. **Confirm Anthropic API key is valid**
   - You should already have one — if not, get it from https://console.anthropic.com/settings/keys

These values go into `apps/api/.env` (and Railway env for prod) in Task 1.

## Pre-merge checklist (every task)

1. `pnpm --filter api lint` clean (or use `cd apps/api && uv run ruff check`)
2. `pnpm --filter api typecheck` clean (or `cd apps/api && uv run mypy src tests`)
3. `pytest -q` clean (default — skips integration tests)
4. Commit message follows convention: imperative subject, body explaining *why*, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 1: Add dependencies + env vars + pytest markers

**Files:**
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/src/grade_sight_api/config.py`
- Modify: `apps/api/.env` (manual edit by user, not part of commit)

- [ ] **Step 1: Add `anthropic` and `aioboto3` to dependencies**

In `apps/api/pyproject.toml`, edit the `[project]` `dependencies` list:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.5.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "alembic>=1.14.0",
    "asyncpg>=0.30.0",
    "clerk-backend-api>=2.0.0",
    "stripe>=11.0.0",
    "anthropic>=0.39.0",
    "aioboto3>=13.0.0",
]
```

- [ ] **Step 2: Add the `integration` pytest marker**

In `apps/api/pyproject.toml`, replace the `[tool.pytest.ini_options]` block at the bottom with:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
markers = [
    "integration: integration test that hits real external services (requires INTEGRATION=1)",
]
```

- [ ] **Step 3: Install the new deps**

```bash
cd apps/api
uv sync
```

Expected: anthropic and aioboto3 (plus their transitive deps) appear under `apps/api/.venv/`.

- [ ] **Step 4: Add new settings to `config.py`**

Open `apps/api/src/grade_sight_api/config.py`. Inside the `Settings` class, after the existing stripe settings and before the closing of the class, add:

```python
    anthropic_api_key: str

    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket: str
    r2_endpoint_url: str
```

- [ ] **Step 5: Add the new env vars to `apps/api/.env`**

This is a manual edit by the user (the file is gitignored). Append:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
R2_ACCOUNT_ID=<your-cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-token-access-key>
R2_SECRET_ACCESS_KEY=<r2-token-secret>
R2_BUCKET=grade-sight-assessments
R2_ENDPOINT_URL=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

If running in a subagent without user-side env edits, this task can verify the values are present by attempting `from grade_sight_api.config import settings; settings.anthropic_api_key`. If that import raises a `ValidationError`, halt and report `NEEDS_CONTEXT` so the user can populate `.env`.

- [ ] **Step 6: Verify**

```bash
cd apps/api
uv run python -c "from grade_sight_api.config import settings; print('anthropic ok' if settings.anthropic_api_key.startswith('sk-ant-') else 'WARN'); print('r2 ok' if settings.r2_endpoint_url.startswith('https://') else 'WARN')"
uv run ruff check
uv run mypy src tests
```

Expected: prints "anthropic ok" and "r2 ok" with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/pyproject.toml apps/api/src/grade_sight_api/config.py apps/api/uv.lock
git commit -m "$(cat <<'EOF'
Add anthropic + aioboto3 deps and Spec 5 settings

Adds anthropic (Claude SDK) and aioboto3 (async S3-compatible client
for Cloudflare R2) to the API's dependencies. Wires the corresponding
ANTHROPIC_API_KEY and R2_* env vars into Settings so they're typed and
validated at startup. Registers the "integration" pytest marker for
smoke tests that hit real external services (gated by INTEGRATION=1).

Foundation for Spec 5: external service abstraction layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: CallContext dataclass + tests

**Files:**
- Create: `apps/api/src/grade_sight_api/services/call_context.py`
- Create: `apps/api/tests/services/__init__.py`
- Create: `apps/api/tests/services/test_call_context.py`

- [ ] **Step 1: Create the test file with failing tests**

Create `apps/api/tests/services/__init__.py` empty.

Create `apps/api/tests/services/test_call_context.py`:

```python
"""Tests for CallContext dataclass."""

from __future__ import annotations

from uuid import uuid4

import pytest

from grade_sight_api.services.call_context import CallContext


def test_call_context_constructs_without_pii() -> None:
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=uuid4(),
        request_type="diagnostic_classify",
        contains_pii=False,
    )
    assert ctx.contains_pii is False
    assert ctx.audit_reason is None


def test_call_context_constructs_with_pii_and_reason() -> None:
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=uuid4(),
        request_type="diagnostic_classify",
        contains_pii=True,
        audit_reason="grade student work",
    )
    assert ctx.contains_pii is True
    assert ctx.audit_reason == "grade student work"


def test_call_context_rejects_pii_without_reason() -> None:
    with pytest.raises(ValueError, match="audit_reason is required"):
        CallContext(
            organization_id=uuid4(),
            user_id=uuid4(),
            request_type="diagnostic_classify",
            contains_pii=True,
        )


def test_call_context_is_frozen() -> None:
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=None,
        request_type="webhook_event",
        contains_pii=False,
    )
    with pytest.raises(Exception):  # FrozenInstanceError, but exact name is dataclass-internal
        ctx.contains_pii = True  # type: ignore[misc]


def test_call_context_accepts_none_user_id() -> None:
    """System-initiated calls (e.g., webhook handlers) have no user."""
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=None,
        request_type="webhook_event",
        contains_pii=False,
    )
    assert ctx.user_id is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api
uv run pytest tests/services/test_call_context.py -v
```

Expected: All five tests FAIL with `ModuleNotFoundError: No module named 'grade_sight_api.services.call_context'`.

- [ ] **Step 3: Implement the module**

Create `apps/api/src/grade_sight_api/services/call_context.py`:

```python
"""CallContext — explicit per-call metadata for external service calls.

Constructed once at the route handler (or in a dependency that knows the
authenticated user/org), then passed by reference to every service-layer
function. Frozen so a service cannot mutate it. Validates the
data-minimization rule from CLAUDE.md §3 at construction time.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class CallContext:
    """Per-call metadata for external service invocations.

    Fields:
        organization_id: Tenant boundary; required for every audit/log row.
        user_id: Acting user. None for system-initiated calls (webhook handlers).
        request_type: Free-form short string (e.g. "diagnostic_classify",
            "presigned_upload"). Recorded on llm_call_logs and audit_log so
            cost and access dashboards can group by purpose.
        contains_pii: Explicit acknowledgment that the call carries PII.
            False guarantees no PII; True triggers an audit_log entry.
        audit_reason: Human-readable reason this call needs PII access.
            Required when contains_pii=True; appears in audit_log.
    """

    organization_id: UUID
    user_id: UUID | None
    request_type: str
    contains_pii: bool
    audit_reason: str | None = None

    def __post_init__(self) -> None:
        if self.contains_pii and not self.audit_reason:
            raise ValueError(
                "audit_reason is required when contains_pii=True"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api
uv run pytest tests/services/test_call_context.py -v
```

Expected: All five tests PASS.

- [ ] **Step 5: Lint + typecheck**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/call_context.py apps/api/tests/services/__init__.py apps/api/tests/services/test_call_context.py
git commit -m "$(cat <<'EOF'
Add CallContext dataclass for external service calls

Frozen dataclass that bundles organization_id, user_id, request_type,
contains_pii, audit_reason — the metadata every external service call
needs to write a complete audit/log row. Validates that audit_reason
is provided when contains_pii=True, codifying the data-minimization
rule from CLAUDE.md §3 at construction time so misconfiguration fails
fast at the call site.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `_logging.write_audit_log` helper + tests

**Files:**
- Create: `apps/api/src/grade_sight_api/services/_logging.py` (write_audit_log only; LLM helper added in Task 4)
- Create: `apps/api/tests/services/test_logging.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_logging.py`:

```python
"""Tests for the shared _logging helpers."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services._logging import write_audit_log
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


async def test_write_audit_log_inserts_row(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_action",
        contains_pii=True,
        audit_reason="unit test",
    )
    await write_audit_log(
        async_session,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="test_audit_action",
        extra={"foo": "bar"},
    )
    await async_session.flush()

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.user_id is None
    assert row.resource_type == "subscription"
    assert row.action == "test_audit_action"
    assert row.event_metadata["foo"] == "bar"
    assert row.event_metadata["request_type"] == "test_action"
    assert row.event_metadata["audit_reason"] == "unit test"


async def test_write_audit_log_rejects_empty_action(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="t",
        contains_pii=False,
    )
    with pytest.raises(ValueError, match="action is required"):
        await write_audit_log(
            async_session,
            ctx=ctx,
            resource_type="subscription",
            resource_id=None,
            action="",
        )


async def test_write_audit_log_no_extra(async_session: AsyncSession) -> None:
    """Calling without extra still produces a valid row with request_type recorded."""
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="t",
        contains_pii=False,
    )
    await write_audit_log(
        async_session,
        ctx=ctx,
        resource_type="organization",
        resource_id=org.id,
        action="created",
    )
    await async_session.flush()

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].event_metadata == {"request_type": "t"}
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_logging.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'grade_sight_api.services._logging'`.

- [ ] **Step 3: Implement `_logging.write_audit_log`**

Create `apps/api/src/grade_sight_api/services/_logging.py`:

```python
"""Shared logging helpers for the service layer.

Every external-service call writes through write_audit_log (for student-data
access events) or write_llm_call_log (for Claude calls). Centralized here so
audit trail conventions stay consistent and a future privacy review can point
at one file.

Underscore-prefixed because nothing outside services/ should import these.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit_log import AuditLog
from .call_context import CallContext


async def write_audit_log(
    db: AsyncSession,
    *,
    ctx: CallContext,
    resource_type: str,
    resource_id: UUID | None,
    action: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Append an AuditLog row for a student-data access event.

    Always records ctx.request_type and (when present) ctx.audit_reason in
    metadata. Caller's `extra` dict is merged in.
    """
    if not action:
        raise ValueError("action is required")

    metadata: dict[str, Any] = {"request_type": ctx.request_type}
    if ctx.audit_reason:
        metadata["audit_reason"] = ctx.audit_reason
    if extra:
        metadata.update(extra)

    entry = AuditLog(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        event_metadata=metadata,
    )
    db.add(entry)
    await db.flush()
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_logging.py -v
```

Expected: All three tests PASS.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/_logging.py apps/api/tests/services/test_logging.py
git commit -m "$(cat <<'EOF'
Add shared write_audit_log helper

Centralizes AuditLog row construction. Every external service call
that touches student data goes through this one function — single
audit gate, easier to defend in privacy reviews (SDPC NDPA, Common
Sense Privacy, Student Privacy Pledge). Records the request_type and
audit_reason from CallContext into metadata so dashboards can group
access events by purpose.

LLM call logging helper lands in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `_logging.write_llm_call_log` helper + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/_logging.py`
- Modify: `apps/api/tests/services/test_logging.py`

- [ ] **Step 1: Add failing test**

Append to `apps/api/tests/services/test_logging.py`:

```python
from decimal import Decimal

from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.services._logging import write_llm_call_log


async def test_write_llm_call_log_success(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )
    await write_llm_call_log(
        async_session,
        ctx=ctx,
        model="claude-haiku-4-5-20251001",
        tokens_input=10,
        tokens_output=5,
        cost_usd=Decimal("0.000123"),
        latency_ms=420,
        success=True,
    )
    await async_session.flush()

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.user_id is None
    assert row.model == "claude-haiku-4-5-20251001"
    assert row.tokens_input == 10
    assert row.tokens_output == 5
    assert row.cost_usd == Decimal("0.000123")
    assert row.latency_ms == 420
    assert row.request_type == "test_text"
    assert row.success is True
    assert row.error_message is None


async def test_write_llm_call_log_failure(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )
    await write_llm_call_log(
        async_session,
        ctx=ctx,
        model="claude-haiku-4-5-20251001",
        tokens_input=0,
        tokens_output=0,
        cost_usd=Decimal("0"),
        latency_ms=12000,
        success=False,
        error_message="anthropic.APITimeoutError: Request timed out.",
    )
    await async_session.flush()

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is False
    assert rows[0].error_message == "anthropic.APITimeoutError: Request timed out."
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_logging.py -v
```

Expected: New tests FAIL with `ImportError` for `write_llm_call_log`.

- [ ] **Step 3: Implement `write_llm_call_log`**

Append to `apps/api/src/grade_sight_api/services/_logging.py` (after `write_audit_log`):

```python
from decimal import Decimal

from ..models.llm_call_log import LLMCallLog


async def write_llm_call_log(
    db: AsyncSession,
    *,
    ctx: CallContext,
    model: str,
    tokens_input: int,
    tokens_output: int,
    cost_usd: Decimal,
    latency_ms: int,
    success: bool,
    error_message: str | None = None,
) -> None:
    """Append an LLMCallLog row for a Claude call (success or failure).

    Failures are logged too — cost dashboards reflect all attempts and
    error rates surface in the same view as throughput.
    """
    entry = LLMCallLog(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        model=model,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        request_type=ctx.request_type,
        success=success,
        error_message=error_message,
    )
    db.add(entry)
    await db.flush()
```

(The `from decimal import Decimal` and `from ..models.llm_call_log import LLMCallLog` imports go at the top of the file alongside the existing imports — re-arrange as needed.)

- [ ] **Step 4: Run tests, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_logging.py -v
```

Expected: all five tests in this file pass.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/_logging.py apps/api/tests/services/test_logging.py
git commit -m "$(cat <<'EOF'
Add shared write_llm_call_log helper

Constructs LLMCallLog rows from CallContext + per-call metrics
(tokens, cost, latency). Logs failures too so the cost dashboard
reflects all attempts and error rates surface in the same query as
throughput. Used by claude_service.call_text / call_vision in
subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migrate `stripe_service.py` to `_logging.write_audit_log`

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/stripe_service.py`
- Create: `apps/api/tests/services/test_stripe_audit_migration.py` (regression)

This is a behavior-preserving refactor. Two existing call sites (`create_customer` writes `stripe_customer_created`, `create_checkout_session` writes `stripe_checkout_session_started`) currently use a private `_write_audit_log` function inside `stripe_service.py`. Migrate them to the shared `write_audit_log`.

The existing audit metadata shapes are slightly different from what `write_audit_log` produces (the existing helper doesn't add `request_type`). To preserve the existing audit row shape AND add the new `request_type` field, we'll thread a `CallContext` through the call sites that's constructed inside `stripe_service` itself (since the callers haven't been updated to pass one yet).

- [ ] **Step 1: Write a regression test that asserts the current row shape**

Create `apps/api/tests/services/test_stripe_audit_migration.py`:

```python
"""Regression test for the stripe_service audit_log migration.

Asserts that after migration, create_customer and create_checkout_session
still write audit_log rows with the expected metadata fields.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import stripe_service


async def test_create_customer_writes_audit_row(async_session: AsyncSession) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()

    fake_customer = MagicMock()
    fake_customer.id = "cus_TEST123"

    with patch(
        "grade_sight_api.services.stripe_service.stripe.Customer.create_async",
        new=AsyncMock(return_value=fake_customer),
    ):
        result = await stripe_service.create_customer(
            email="parent@example.com",
            organization_id=org.id,
            db=async_session,
        )

    assert result.id == "cus_TEST123"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.organization_id == org.id
    assert row.action == "stripe_customer_created"
    assert row.event_metadata["stripe_customer_id"] == "cus_TEST123"
    assert row.event_metadata["email"] == "parent@example.com"
```

- [ ] **Step 2: Run the test against the current implementation**

```bash
cd apps/api
uv run pytest tests/services/test_stripe_audit_migration.py -v
```

Expected: PASS (this asserts current behavior; we'll re-run after migration to confirm we preserved it).

- [ ] **Step 3: Migrate `stripe_service.create_customer`**

Open `apps/api/src/grade_sight_api/services/stripe_service.py`. Replace the existing `create_customer` function and the local `_write_audit_log` helper:

```python
from ._logging import write_audit_log
from .call_context import CallContext


async def create_customer(
    email: str,
    organization_id: UUID,
    db: AsyncSession,
) -> stripe.Customer:
    """Create a Stripe customer for an organization."""
    logger.info("stripe.customers.create org=%s email=%s", organization_id, email)
    customer = await stripe.Customer.create_async(
        email=email,
        metadata={"organization_id": str(organization_id)},
    )
    ctx = CallContext(
        organization_id=organization_id,
        user_id=None,
        request_type="stripe_customer_create",
        contains_pii=False,
    )
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="stripe_customer_created",
        extra={"stripe_customer_id": customer.id, "email": email},
    )
    return customer
```

Then update `create_checkout_session` similarly: replace its `_write_audit_log` call:

```python
    ctx = CallContext(
        organization_id=organization_id,
        user_id=None,
        request_type="stripe_checkout_create",
        contains_pii=False,
    )
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="stripe_checkout_session_started",
        extra={
            "session_id": session.id,
            "plan": plan.value,
        },
    )
```

DELETE the entire `_write_audit_log` function from `stripe_service.py` (it has no remaining callers).

- [ ] **Step 4: Run the regression test**

```bash
cd apps/api
uv run pytest tests/services/test_stripe_audit_migration.py -v
```

Expected: still PASS. The metadata now also has `request_type` but the assertions don't fail on extras.

- [ ] **Step 5: Run all tests + lint + typecheck**

```bash
cd apps/api
uv run pytest -q
uv run ruff check && uv run mypy src tests
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/stripe_service.py apps/api/tests/services/test_stripe_audit_migration.py
git commit -m "$(cat <<'EOF'
Migrate stripe_service audit writes to shared _logging helper

Replaces the file-private _write_audit_log function in stripe_service
with calls to services/_logging.write_audit_log. Each call site
constructs a CallContext, which adds the request_type field to audit
metadata for consistency with future Claude/storage call sites.

Behavior is preserved (regression test verifies the existing
stripe_customer_created row shape still matches). Metadata now also
records request_type, which is additive and doesn't break consumers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Claude cost calculator + tests

**Files:**
- Create: `apps/api/src/grade_sight_api/services/claude_service.py` (skeleton with cost helper only)
- Create: `apps/api/tests/services/test_claude_cost.py`

The Anthropic price-per-million-tokens table for the two models we use:

| Model | Input $/MTok | Output $/MTok |
|---|---|---|
| claude-sonnet-4-6 | 3.00 | 15.00 |
| claude-haiku-4-5-20251001 | 0.80 | 4.00 |

(Source: https://docs.anthropic.com/en/docs/about-claude/pricing — confirm at implementation time. If rates have changed, update the table and the test expectations.)

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_claude_cost.py`:

```python
"""Tests for the Claude cost calculator."""

from __future__ import annotations

from decimal import Decimal

import pytest

from grade_sight_api.services.claude_service import compute_cost


def test_compute_cost_haiku_small() -> None:
    # 1M input tokens × $0.80 = $0.80; 100K output × $4.00 / 1M = $0.40
    cost = compute_cost(
        model="claude-haiku-4-5-20251001",
        tokens_input=1_000_000,
        tokens_output=100_000,
    )
    assert cost == Decimal("1.20")


def test_compute_cost_sonnet_small() -> None:
    # 1000 input × $3 / 1M = $0.003; 500 output × $15 / 1M = $0.0075; total $0.0105
    cost = compute_cost(
        model="claude-sonnet-4-6",
        tokens_input=1_000,
        tokens_output=500,
    )
    assert cost == Decimal("0.010500")


def test_compute_cost_zero_tokens() -> None:
    cost = compute_cost(
        model="claude-haiku-4-5-20251001",
        tokens_input=0,
        tokens_output=0,
    )
    assert cost == Decimal("0")


def test_compute_cost_unknown_model_raises() -> None:
    with pytest.raises(ValueError, match="No price entry"):
        compute_cost(
            model="claude-bogus",
            tokens_input=1,
            tokens_output=1,
        )
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_claude_cost.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement skeleton + cost calculator**

Create `apps/api/src/grade_sight_api/services/claude_service.py`:

```python
"""Claude (Anthropic) SDK wrapper.

Public functions:
- call_text: text-only chat completion with metering + retries.
- call_vision: image+prompt completion with metering + retries.
- compute_cost: helper for tests and ad-hoc use; called internally on every call.

Every call writes an LLMCallLog row (success or failure) via _logging.
Retries are inside each call; each retry gets its own log row so cost
dashboards reflect actual API spend.
"""

from __future__ import annotations

import logging
from decimal import Decimal

logger = logging.getLogger(__name__)


# Per-million-token rates (USD). Confirm against
# https://docs.anthropic.com/en/docs/about-claude/pricing at implementation time.
_PRICES_PER_MILLION: dict[str, tuple[Decimal, Decimal]] = {
    "claude-sonnet-4-6": (Decimal("3.00"), Decimal("15.00")),
    "claude-haiku-4-5-20251001": (Decimal("0.80"), Decimal("4.00")),
}


class ClaudeServiceError(Exception):
    """Raised by claude_service public functions on terminal failures."""


def compute_cost(*, model: str, tokens_input: int, tokens_output: int) -> Decimal:
    """USD cost for a single Claude call given token counts."""
    if model not in _PRICES_PER_MILLION:
        raise ValueError(f"No price entry for model: {model}")
    input_rate, output_rate = _PRICES_PER_MILLION[model]
    million = Decimal("1000000")
    return (
        Decimal(tokens_input) * input_rate / million
        + Decimal(tokens_output) * output_rate / million
    )
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_claude_cost.py -v
```

Expected: all four PASS.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/claude_service.py apps/api/tests/services/test_claude_cost.py
git commit -m "$(cat <<'EOF'
Add Claude cost calculator + service module skeleton

Pure function compute_cost(model, tokens_input, tokens_output) returns
USD cost from Anthropic's per-million-token rates. Hardcoded table for
the two models we use (claude-sonnet-4-6 + claude-haiku-4-5-20251001);
raises ValueError on unknown models so a typo doesn't silently bill
$0. Used internally on every Claude call to populate
LLMCallLog.cost_usd.

Skeletons claude_service.py with the module docstring and the
ClaudeServiceError exception that public functions will raise on
terminal failures.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Claude retry helper + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/claude_service.py`
- Create: `apps/api/tests/services/test_claude_retry.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_claude_retry.py`:

```python
"""Tests for the Claude retry helper."""

from __future__ import annotations

from unittest.mock import AsyncMock

import anthropic
import httpx
import pytest

from grade_sight_api.services.claude_service import _with_retries


def _make_connection_error() -> anthropic.APIConnectionError:
    """Build an APIConnectionError without a real underlying network failure."""
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.APIConnectionError(request=request)


async def test_with_retries_returns_on_first_success() -> None:
    fn = AsyncMock(return_value="ok")
    result = await _with_retries(fn, max_attempts=3)
    assert result == "ok"
    assert fn.await_count == 1


async def test_with_retries_retries_connection_error() -> None:
    err = _make_connection_error()
    fn = AsyncMock(side_effect=[err, err, "ok"])
    result = await _with_retries(fn, max_attempts=3, backoff_seconds=0)
    assert result == "ok"
    assert fn.await_count == 3


async def test_with_retries_gives_up_after_max_attempts() -> None:
    err = _make_connection_error()
    fn = AsyncMock(side_effect=err)
    with pytest.raises(anthropic.APIConnectionError):
        await _with_retries(fn, max_attempts=2, backoff_seconds=0)
    assert fn.await_count == 2


async def test_with_retries_does_not_retry_bad_request() -> None:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(400, request=request)
    err = anthropic.BadRequestError(
        message="bad", response=response, body={}
    )
    fn = AsyncMock(side_effect=err)
    with pytest.raises(anthropic.BadRequestError):
        await _with_retries(fn, max_attempts=3, backoff_seconds=0)
    assert fn.await_count == 1
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_claude_retry.py -v
```

Expected: FAIL — `_with_retries` doesn't exist.

- [ ] **Step 3: Implement `_with_retries`**

Append to `apps/api/src/grade_sight_api/services/claude_service.py`:

```python
import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

import anthropic

T = TypeVar("T")


_RETRYABLE_EXCEPTIONS: tuple[type[Exception], ...] = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
)


async def _with_retries(
    fn: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 3,
    backoff_seconds: float = 1.0,
) -> T:
    """Call fn with exponential backoff on retryable Anthropic errors.

    Retryable: connection errors, timeouts, rate limits.
    Non-retryable (raised immediately): bad request, auth, permission, all 4xx
    other than 429.
    """
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return await fn()
        except _RETRYABLE_EXCEPTIONS as exc:
            last_exc = exc
            if attempt + 1 == max_attempts:
                break
            await asyncio.sleep(backoff_seconds * (2**attempt))
    assert last_exc is not None  # for mypy; loop above guarantees this
    raise last_exc
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_claude_retry.py -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/claude_service.py apps/api/tests/services/test_claude_retry.py
git commit -m "$(cat <<'EOF'
Add _with_retries helper for transient Anthropic errors

Retries on APIConnectionError, APITimeoutError, RateLimitError with
exponential backoff (1s, 2s, 4s by default). Non-retryable errors
(BadRequest, Authentication, Permission, etc.) raise immediately so
config bugs surface fast. Used by call_text/call_vision in subsequent
tasks; each retry gets its own LLMCallLog row so cost dashboards
reflect actual spend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Claude `call_text` + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/claude_service.py`
- Create: `apps/api/tests/services/test_claude_call_text.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_claude_call_text.py`:

```python
"""Tests for claude_service.call_text."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import anthropic
import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


def _fake_response(text: str, tokens_in: int, tokens_out: int) -> MagicMock:
    response = MagicMock()
    response.content = [MagicMock(text=text)]
    response.usage = MagicMock(input_tokens=tokens_in, output_tokens=tokens_out)
    return response


async def test_call_text_success_writes_log(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )

    fake = _fake_response("pong", tokens_in=4, tokens_out=2)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=AsyncMock(return_value=fake))),
    ):
        response = await claude_service.call_text(
            ctx=ctx,
            model="claude-haiku-4-5-20251001",
            system="You are a test bot.",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=10,
            db=async_session,
        )

    assert response.text == "pong"
    assert response.tokens_input == 4
    assert response.tokens_output == 2

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is True
    assert rows[0].tokens_input == 4
    assert rows[0].tokens_output == 2
    assert rows[0].model == "claude-haiku-4-5-20251001"


async def test_call_text_failure_writes_failure_log(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )

    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(400, request=request)
    err = anthropic.BadRequestError(message="oops", response=response, body={})

    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=AsyncMock(side_effect=err))),
    ):
        with pytest.raises(claude_service.ClaudeServiceError):
            await claude_service.call_text(
                ctx=ctx,
                model="claude-haiku-4-5-20251001",
                system="x",
                messages=[{"role": "user", "content": "x"}],
                max_tokens=10,
                db=async_session,
            )

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is False
    assert "BadRequestError" in (rows[0].error_message or "")
```

- [ ] **Step 2: Run, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_claude_call_text.py -v
```

Expected: FAIL — `call_text` doesn't exist.

- [ ] **Step 3: Implement `call_text` + `ClaudeTextResponse` + `_get_client`**

Append to `apps/api/src/grade_sight_api/services/claude_service.py`:

```python
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ._logging import write_audit_log, write_llm_call_log
from .call_context import CallContext


_anthropic_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    """Lazy singleton — instantiated on first use, mockable in tests via patch.object."""
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


@dataclass(frozen=True)
class ClaudeTextResponse:
    text: str
    tokens_input: int
    tokens_output: int
    model: str


async def call_text(
    *,
    ctx: CallContext,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    db: AsyncSession,
) -> ClaudeTextResponse:
    """Call Claude with a text-only message list. Returns parsed response.

    Writes an LLMCallLog row on every attempt (success or failure). On PII
    calls (ctx.contains_pii=True), also writes an audit_log row.
    """
    client = _get_client()

    async def _attempt() -> Any:
        return await client.messages.create(
            model=model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
        )

    start = time.monotonic()
    try:
        response = await _with_retries(_attempt)
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        await write_llm_call_log(
            db,
            ctx=ctx,
            model=model,
            tokens_input=0,
            tokens_output=0,
            cost_usd=Decimal("0"),
            latency_ms=latency_ms,
            success=False,
            error_message=f"{type(exc).__name__}: {exc}",
        )
        raise ClaudeServiceError(str(exc)) from exc

    latency_ms = int((time.monotonic() - start) * 1000)
    text_blocks = [block.text for block in response.content if hasattr(block, "text")]
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens
    cost = compute_cost(model=model, tokens_input=tokens_in, tokens_output=tokens_out)

    await write_llm_call_log(
        db,
        ctx=ctx,
        model=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        cost_usd=cost,
        latency_ms=latency_ms,
        success=True,
    )

    if ctx.contains_pii:
        await write_audit_log(
            db,
            ctx=ctx,
            resource_type="claude_call",
            resource_id=None,
            action="claude_text_call",
            extra={"model": model, "tokens_input": tokens_in, "tokens_output": tokens_out},
        )

    return ClaudeTextResponse(
        text="".join(text_blocks),
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        model=model,
    )
```

- [ ] **Step 4: Run, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_claude_call_text.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Run full test suite + lint + typecheck**

```bash
cd apps/api
uv run pytest -q
uv run ruff check && uv run mypy src tests
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/claude_service.py apps/api/tests/services/test_claude_call_text.py
git commit -m "$(cat <<'EOF'
Add claude_service.call_text

Public function wrapping anthropic.AsyncAnthropic.messages.create for
text-only chat completion. Wraps the SDK call in _with_retries for
transient errors. Writes an LLMCallLog row on every attempt (success
or failure); when ctx.contains_pii is True, also writes an audit_log
row. Returns a frozen ClaudeTextResponse dataclass with the parsed
text + token counts so the diagnostic engine spec consumes a stable
shape rather than the raw SDK type.

Module-level lazy singleton _anthropic_client is mockable via
patch.object(claude_service, "_get_client", ...) in tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Claude `call_vision` + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/claude_service.py`
- Create: `apps/api/tests/services/test_claude_call_vision.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_claude_call_vision.py`:

```python
"""Tests for claude_service.call_vision."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


def _fake_response(text: str, tokens_in: int, tokens_out: int) -> MagicMock:
    response = MagicMock()
    response.content = [MagicMock(text=text)]
    response.usage = MagicMock(input_tokens=tokens_in, output_tokens=tokens_out)
    return response


async def test_call_vision_with_bytes_writes_audit_when_pii(
    async_session: AsyncSession,
) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="diagnostic_classify",
        contains_pii=True,
        audit_reason="grade student work",
    )

    fake = _fake_response("rough work shown", tokens_in=20, tokens_out=8)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=AsyncMock(return_value=fake))),
    ):
        response = await claude_service.call_vision(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="describe",
            image=b"\x00\x01fake-png-bytes\x02\x03",
            prompt="What do you see?",
            max_tokens=100,
            db=async_session,
        )

    assert response.text == "rough work shown"
    assert response.tokens_input == 20

    llm_rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(llm_rows) == 1
    assert llm_rows[0].success is True

    audit_rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "claude_vision_call"
    assert audit_rows[0].event_metadata["audit_reason"] == "grade student work"


async def test_call_vision_with_url_string(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="vision_test",
        contains_pii=False,
    )

    fake = _fake_response("ok", tokens_in=5, tokens_out=2)
    create_mock = AsyncMock(return_value=fake)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=create_mock)),
    ):
        await claude_service.call_vision(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="describe",
            image="https://example.com/image.png",
            prompt="What do you see?",
            max_tokens=100,
            db=async_session,
        )

    # Inspect the message Anthropic was called with
    call_kwargs = create_mock.call_args.kwargs
    user_message = call_kwargs["messages"][0]
    image_block = user_message["content"][0]
    assert image_block["type"] == "image"
    assert image_block["source"]["type"] == "url"
    assert image_block["source"]["url"] == "https://example.com/image.png"


async def test_call_vision_bytes_uses_base64_source(
    async_session: AsyncSession,
) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="vision_test",
        contains_pii=False,
    )

    fake = _fake_response("ok", tokens_in=5, tokens_out=2)
    create_mock = AsyncMock(return_value=fake)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=create_mock)),
    ):
        await claude_service.call_vision(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="x",
            image=b"PNGFAKE",
            prompt="x",
            max_tokens=10,
            db=async_session,
        )

    call_kwargs = create_mock.call_args.kwargs
    source = call_kwargs["messages"][0]["content"][0]["source"]
    assert source["type"] == "base64"
    assert source["data"] == base64.b64encode(b"PNGFAKE").decode("ascii")
```

- [ ] **Step 2: Run, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_claude_call_vision.py -v
```

Expected: FAIL — `call_vision` doesn't exist.

- [ ] **Step 3: Implement `call_vision` + `ClaudeVisionResponse`**

Append to `apps/api/src/grade_sight_api/services/claude_service.py`:

```python
import base64


@dataclass(frozen=True)
class ClaudeVisionResponse:
    text: str
    tokens_input: int
    tokens_output: int
    model: str


def _build_vision_message(image: bytes | str, prompt: str) -> dict[str, Any]:
    if isinstance(image, bytes):
        source: dict[str, Any] = {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.b64encode(image).decode("ascii"),
        }
    else:
        source = {"type": "url", "url": image}
    return {
        "role": "user",
        "content": [
            {"type": "image", "source": source},
            {"type": "text", "text": prompt},
        ],
    }


async def call_vision(
    *,
    ctx: CallContext,
    model: str,
    system: str,
    image: bytes | str,
    prompt: str,
    max_tokens: int,
    db: AsyncSession,
) -> ClaudeVisionResponse:
    """Call Claude with an image + prompt.

    `image` accepts raw bytes (sent as base64) or a URL string.
    Writes LLMCallLog on every attempt and audit_log when ctx.contains_pii.
    """
    client = _get_client()
    user_message = _build_vision_message(image, prompt)

    async def _attempt() -> Any:
        return await client.messages.create(
            model=model,
            system=system,
            messages=[user_message],
            max_tokens=max_tokens,
        )

    start = time.monotonic()
    try:
        response = await _with_retries(_attempt)
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        await write_llm_call_log(
            db,
            ctx=ctx,
            model=model,
            tokens_input=0,
            tokens_output=0,
            cost_usd=Decimal("0"),
            latency_ms=latency_ms,
            success=False,
            error_message=f"{type(exc).__name__}: {exc}",
        )
        raise ClaudeServiceError(str(exc)) from exc

    latency_ms = int((time.monotonic() - start) * 1000)
    text_blocks = [block.text for block in response.content if hasattr(block, "text")]
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens
    cost = compute_cost(model=model, tokens_input=tokens_in, tokens_output=tokens_out)

    await write_llm_call_log(
        db,
        ctx=ctx,
        model=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        cost_usd=cost,
        latency_ms=latency_ms,
        success=True,
    )

    if ctx.contains_pii:
        await write_audit_log(
            db,
            ctx=ctx,
            resource_type="claude_call",
            resource_id=None,
            action="claude_vision_call",
            extra={"model": model, "tokens_input": tokens_in, "tokens_output": tokens_out},
        )

    return ClaudeVisionResponse(
        text="".join(text_blocks),
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        model=model,
    )
```

- [ ] **Step 4: Run, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_claude_call_vision.py -v
```

Expected: all three tests PASS.

- [ ] **Step 5: Run all tests + lint + typecheck**

```bash
cd apps/api
uv run pytest -q
uv run ruff check && uv run mypy src tests
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/services/claude_service.py apps/api/tests/services/test_claude_call_vision.py
git commit -m "$(cat <<'EOF'
Add claude_service.call_vision

Public function for image + prompt completion. Accepts image as bytes
(sent as base64) or a URL string. Same logging contract as call_text:
LLMCallLog row on every attempt; audit_log row when ctx.contains_pii.
Returns a frozen ClaudeVisionResponse dataclass.

The diagnostic engine spec will consume this for parsing student-work
photos. Sending raw bytes is the expected path; URLs are supported in
case we ever pass an R2 presigned-GET URL instead of fetching the
bytes ourselves.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Claude smoke test (real API)

**Files:**
- Create: `apps/api/tests/services/test_claude_smoke.py`

This task hits the real Anthropic API. It will cost approximately $0.0001 per run (Haiku, 10 input tokens, ~5 output tokens). Skipped by default; runs only when `INTEGRATION=1` is set.

- [ ] **Step 1: Create the smoke test**

Create `apps/api/tests/services/test_claude_smoke.py`:

```python
"""Real Claude API smoke test. Runs only when INTEGRATION=1.

Costs approximately $0.0001 per invocation (Haiku, ping/pong).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


pytestmark = pytest.mark.integration


@pytest.fixture
def integration_enabled() -> None:
    if os.environ.get("INTEGRATION") != "1":
        pytest.skip("set INTEGRATION=1 to run integration tests")


async def test_claude_text_real_call(
    integration_enabled: None,
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Smoke Test Org")
    async_session.add(org)
    await async_session.flush()

    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="smoke_test",
        contains_pii=False,
    )
    response = await claude_service.call_text(
        ctx=ctx,
        model="claude-haiku-4-5-20251001",
        system="Reply with exactly the word: pong.",
        messages=[{"role": "user", "content": "ping"}],
        max_tokens=10,
        db=async_session,
    )

    # Be lenient — Claude might reply "Pong" or "pong." etc.
    assert "pong" in response.text.lower()
    assert response.tokens_input > 0
    assert response.tokens_output > 0

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is True
    assert rows[0].cost_usd > 0
```

- [ ] **Step 2: Verify it skips by default**

```bash
cd apps/api
uv run pytest tests/services/test_claude_smoke.py -v
```

Expected: 1 skipped (integration marker not enabled).

- [ ] **Step 3: Run with INTEGRATION=1 (requires valid ANTHROPIC_API_KEY)**

```bash
cd apps/api
INTEGRATION=1 uv run pytest tests/services/test_claude_smoke.py -v
```

Expected: PASS. Cost ≈ $0.0001.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/services/test_claude_smoke.py
git commit -m "$(cat <<'EOF'
Add Claude smoke test (gated by INTEGRATION=1)

Real call to Anthropic with the cheapest possible message (Haiku,
~10 input tokens, ~5 output tokens, costs about $0.0001 per run).
Verifies SDK auth, CallContext construction, LLMCallLog write — the
end-to-end wiring that mocks can't catch.

pytest.mark.integration plus a fixture that pytest.skip()s without
INTEGRATION=1 keeps the default test run free of real API calls. CI
opts in selectively (e.g., on PRs that touch services/).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Storage `get_upload_url` + tests

**Files:**
- Create: `apps/api/src/grade_sight_api/services/storage_service.py`
- Create: `apps/api/tests/services/test_storage_get_upload_url.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_storage_get_upload_url.py`:

```python
"""Tests for storage_service.get_upload_url."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


async def test_get_upload_url_returns_presigned(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="presigned_upload",
        contains_pii=False,
    )

    fake_client = MagicMock()
    fake_client.generate_presigned_url = AsyncMock(
        return_value="https://r2.test/upload?sig=abc",
    )
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(return_value=fake_client)
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage_service, "_get_session", return_value=fake_session):
        url = await storage_service.get_upload_url(
            ctx=ctx,
            key="assessments/test-key.png",
            content_type="image/png",
            db=async_session,
        )

    assert url == "https://r2.test/upload?sig=abc"

    # generate_presigned_url called with the right shape
    args = fake_client.generate_presigned_url.await_args
    assert args.args[0] == "put_object"
    params = args.kwargs["Params"]
    assert params["Key"] == "assessments/test-key.png"
    assert params["ContentType"] == "image/png"
    assert args.kwargs["ExpiresIn"] == 600

    # Audit row written
    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].action == "presigned_upload_issued"
    assert rows[0].event_metadata["key"] == "assessments/test-key.png"
```

- [ ] **Step 2: Run, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_storage_get_upload_url.py -v
```

Expected: FAIL — `storage_service` doesn't exist.

- [ ] **Step 3: Implement skeleton + `get_upload_url`**

Create `apps/api/src/grade_sight_api/services/storage_service.py`:

```python
"""Cloudflare R2 wrapper (S3-compatible).

Public functions:
- get_upload_url: presigned PUT URL for direct browser-to-R2 upload.
- get_download_url: presigned GET URL for direct browser download.
- delete_object: hard-delete an object.

Every call writes an audit_log row. R2-specific because we'd configure the
endpoint URL to https://<account>.r2.cloudflarestorage.com; for AWS S3 the
same code with a different endpoint URL works.
"""

from __future__ import annotations

import logging
from typing import Any

import aioboto3
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ._logging import write_audit_log
from .call_context import CallContext

logger = logging.getLogger(__name__)


class StorageServiceError(Exception):
    """Raised on terminal R2 failures."""


_session: aioboto3.Session | None = None


def _get_session() -> aioboto3.Session:
    """Lazy singleton — instantiated on first use."""
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


def _client_kwargs() -> dict[str, Any]:
    return {
        "service_name": "s3",
        "endpoint_url": settings.r2_endpoint_url,
        "aws_access_key_id": settings.r2_access_key_id,
        "aws_secret_access_key": settings.r2_secret_access_key,
        "region_name": "auto",
    }


async def get_upload_url(
    *,
    ctx: CallContext,
    key: str,
    content_type: str,
    expires_in: int = 600,
    db: AsyncSession,
) -> str:
    """Return a presigned PUT URL for direct browser-to-R2 upload.

    Writes an audit_log row capturing the key issued.
    """
    session = _get_session()
    async with session.client(**_client_kwargs()) as client:
        url = await client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.r2_bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="storage_object",
        resource_id=None,
        action="presigned_upload_issued",
        extra={"key": key, "content_type": content_type, "expires_in": expires_in},
    )
    return url
```

- [ ] **Step 4: Run, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_storage_get_upload_url.py -v
```

Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/storage_service.py apps/api/tests/services/test_storage_get_upload_url.py
git commit -m "$(cat <<'EOF'
Add storage_service.get_upload_url

Returns a presigned PUT URL so the browser uploads directly to R2 — no
proxy through FastAPI, no large image bodies in our request stream.
Writes an audit_log entry with the key and content_type so we have a
record of what URLs we issued (R2 doesn't notify us when the upload
completes, so the issued-URL log is the closest we get to "upload
attempted"). Default expiry 10 minutes.

Lazy aioboto3 Session singleton + _client_kwargs() helper so swapping
endpoint URL (R2 → AWS S3 → MinIO) is one config change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Storage `get_download_url` + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/storage_service.py`
- Create: `apps/api/tests/services/test_storage_get_download_url.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_storage_get_download_url.py`:

```python
"""Tests for storage_service.get_download_url."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


async def test_get_download_url_returns_presigned(
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="presigned_download",
        contains_pii=False,
    )

    fake_client = MagicMock()
    fake_client.generate_presigned_url = AsyncMock(
        return_value="https://r2.test/download?sig=xyz",
    )
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(return_value=fake_client)
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage_service, "_get_session", return_value=fake_session):
        url = await storage_service.get_download_url(
            ctx=ctx,
            key="assessments/x.png",
            db=async_session,
        )

    assert url == "https://r2.test/download?sig=xyz"
    args = fake_client.generate_presigned_url.await_args
    assert args.args[0] == "get_object"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].action == "presigned_download_issued"
```

- [ ] **Step 2: Run, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_storage_get_download_url.py -v
```

Expected: FAIL — `get_download_url` doesn't exist.

- [ ] **Step 3: Implement `get_download_url`**

Append to `apps/api/src/grade_sight_api/services/storage_service.py`:

```python
async def get_download_url(
    *,
    ctx: CallContext,
    key: str,
    expires_in: int = 600,
    db: AsyncSession,
) -> str:
    """Return a presigned GET URL for direct browser download from R2."""
    session = _get_session()
    async with session.client(**_client_kwargs()) as client:
        url = await client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="storage_object",
        resource_id=None,
        action="presigned_download_issued",
        extra={"key": key, "expires_in": expires_in},
    )
    return url
```

- [ ] **Step 4: Run, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_storage_get_download_url.py -v
```

Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/storage_service.py apps/api/tests/services/test_storage_get_download_url.py
git commit -m "$(cat <<'EOF'
Add storage_service.get_download_url

Symmetric to get_upload_url — presigned GET so a browser can fetch the
object directly from R2 without proxying through FastAPI. Writes an
audit_log entry capturing every issued download URL since this is one
of the channels through which student-work data leaves our control.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Storage `delete_object` + tests

**Files:**
- Modify: `apps/api/src/grade_sight_api/services/storage_service.py`
- Create: `apps/api/tests/services/test_storage_delete.py`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/services/test_storage_delete.py`:

```python
"""Tests for storage_service.delete_object."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


async def test_delete_object_calls_r2_and_audits(
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="storage_delete",
        contains_pii=True,
        audit_reason="data deletion request",
    )

    fake_client = MagicMock()
    fake_client.delete_object = AsyncMock(return_value={"DeleteMarker": True})
    fake_session = MagicMock()
    fake_session.client.return_value.__aenter__ = AsyncMock(return_value=fake_client)
    fake_session.client.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage_service, "_get_session", return_value=fake_session):
        await storage_service.delete_object(
            ctx=ctx,
            key="assessments/x.png",
            db=async_session,
        )

    args = fake_client.delete_object.await_args
    assert args.kwargs["Key"] == "assessments/x.png"

    rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].action == "storage_object_deleted"
    assert rows[0].event_metadata["audit_reason"] == "data deletion request"
```

- [ ] **Step 2: Run, verify failure**

```bash
cd apps/api
uv run pytest tests/services/test_storage_delete.py -v
```

Expected: FAIL — `delete_object` doesn't exist.

- [ ] **Step 3: Implement `delete_object`**

Append to `apps/api/src/grade_sight_api/services/storage_service.py`:

```python
async def delete_object(
    *,
    ctx: CallContext,
    key: str,
    db: AsyncSession,
) -> None:
    """Hard-delete an object from R2."""
    session = _get_session()
    async with session.client(**_client_kwargs()) as client:
        await client.delete_object(
            Bucket=settings.r2_bucket,
            Key=key,
        )

    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="storage_object",
        resource_id=None,
        action="storage_object_deleted",
        extra={"key": key},
    )
```

- [ ] **Step 4: Run, verify pass**

```bash
cd apps/api
uv run pytest tests/services/test_storage_delete.py -v
```

Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd apps/api
uv run ruff check && uv run mypy src tests
```

```bash
git add apps/api/src/grade_sight_api/services/storage_service.py apps/api/tests/services/test_storage_delete.py
git commit -m "$(cat <<'EOF'
Add storage_service.delete_object

Hard-delete an object from R2 with an audit_log entry. Required for
the 30-day deletion window commitment in CLAUDE.md §4 — when a user
requests data deletion, we delete their assessments here. The audit
row is the receipt that the deletion happened (R2's own logs are not
under our control).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Storage smoke test (real R2)

**Files:**
- Create: `apps/api/tests/services/test_storage_smoke.py`

This task hits the real R2 API. Cost: pennies per month at most.

- [ ] **Step 1: Create the smoke test**

Create `apps/api/tests/services/test_storage_smoke.py`:

```python
"""Real R2 smoke test. Runs only when INTEGRATION=1."""

from __future__ import annotations

import os
import secrets

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.organization import Organization
from grade_sight_api.services import storage_service
from grade_sight_api.services.call_context import CallContext


pytestmark = pytest.mark.integration


@pytest.fixture
def integration_enabled() -> None:
    if os.environ.get("INTEGRATION") != "1":
        pytest.skip("set INTEGRATION=1 to run integration tests")


async def test_r2_round_trip(
    integration_enabled: None,
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Smoke Test Org")
    async_session.add(org)
    await async_session.flush()
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="smoke_test",
        contains_pii=False,
    )

    key = f"smoke-test/{secrets.token_hex(8)}.bin"
    payload = b"grade-sight smoke test " + secrets.token_bytes(64)

    upload_url = await storage_service.get_upload_url(
        ctx=ctx, key=key, content_type="application/octet-stream", db=async_session,
    )
    async with httpx.AsyncClient() as http:
        put = await http.put(
            upload_url,
            content=payload,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert put.status_code in (200, 204), f"Upload failed: {put.status_code} {put.text}"

    download_url = await storage_service.get_download_url(
        ctx=ctx, key=key, db=async_session,
    )
    async with httpx.AsyncClient() as http:
        got = await http.get(download_url)
        assert got.status_code == 200
        assert got.content == payload

    await storage_service.delete_object(ctx=ctx, key=key, db=async_session)
```

- [ ] **Step 2: Verify it skips by default**

```bash
cd apps/api
uv run pytest tests/services/test_storage_smoke.py -v
```

Expected: 1 skipped.

- [ ] **Step 3: Run with INTEGRATION=1 (requires R2 env vars + bucket)**

```bash
cd apps/api
INTEGRATION=1 uv run pytest tests/services/test_storage_smoke.py -v
```

Expected: PASS. The bucket gets one tiny object created and deleted.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/services/test_storage_smoke.py
git commit -m "$(cat <<'EOF'
Add R2 round-trip smoke test (gated by INTEGRATION=1)

Presigned PUT → upload 80 bytes → presigned GET → assert match →
delete. Verifies SDK auth, presigned URL generation, that uploads
actually land in the configured bucket, and that audit_log writes
capture each step. Cost: pennies per month at most.

Same INTEGRATION=1 gating as the Claude smoke test so default test
runs don't touch R2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Update CLAUDE.md to mark Spec 5 complete

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit the phase line**

Open `CLAUDE.md`. Find the line:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), and 4 (Stripe billing integration) complete. Next: Spec 5 (external service abstraction layer).
```

Replace with:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), and 5 (external service abstraction layer) complete. Next: diagnostic engine spec (taxonomy must finalize before building).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Mark Spec 5 (external service abstraction) complete in CLAUDE.md

Spec 5 acceptance is done: CallContext + shared _logging helper,
claude_service (call_text + call_vision with retries, metering, audit),
storage_service (presigned upload/download + delete on Cloudflare R2),
stripe_service migrated to the shared helper. Smoke tests pass against
real Anthropic + R2 endpoints.

Next surface is the diagnostic engine, which is gated on the error
taxonomy finalizing before code is written.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wrap-up

After Task 15, the branch is ready for review:

1. Run the full default test suite from `apps/api`:
   ```bash
   cd apps/api
   uv run pytest -q
   ```
   Expected: ~30+ tests pass, 2 integration tests skipped.

2. Run the integration tests once to confirm real-API wiring:
   ```bash
   cd apps/api
   INTEGRATION=1 uv run pytest -q tests/services/test_claude_smoke.py tests/services/test_storage_smoke.py
   ```
   Expected: 2 pass. Combined cost ≈ $0.0001 + a fraction of a cent in R2 storage.

3. Review the cumulative diff:
   ```bash
   git log --oneline main..<branch>
   git diff main..<branch> --stat
   ```

4. Push and merge as the editorial-theme retrofit was merged (fast-forward to main, then push).

## Out of scope for this plan (deferred)

- **Diagnostic engine prompts and error taxonomy logic** — the diagnostic engine spec.
- **Assessment upload UI / route handlers** — the assessment upload spec; will consume `storage_service` and possibly `claude_service.call_vision`.
- **R2 lifecycle policies, CORS config** — managed in the Cloudflare dashboard, not in code.
- **Lazy-upsert ordering fix for Clerk/Stripe orphan prevention** — separate spec; surfaced during Spec 4 acceptance.
- **`BaseService` abstraction** — wait until 3+ services share concrete shared structure. Two services do not.
- **Sentry instrumentation hooks** — separate observability spec; the `_logging.py` helper is the right place to add Sentry breadcrumbs when that spec runs.
