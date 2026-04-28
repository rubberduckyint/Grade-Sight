# Sentry Monitoring Implementation Plan (Spec 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Sentry error tracking + 10% performance tracing into the FastAPI backend and Next.js frontend, with PII scrubbing satisfying CLAUDE.md §4. Production-only init gate; pseudonymous user/org UUID context; source-map upload at build; no PII to a third party under any flag.

**Architecture:** Two SDK integrations (`sentry-sdk[fastapi]` on backend, `@sentry/nextjs` on frontend) sharing one Sentry project with `service` tags separating them. Each side has a single-purpose scrubber module wired as `before_send` / `beforeSend`. Init is gated on `ENVIRONMENT=production` AND DSN being set — dev laptops stay completely silent. User context (internal `User.id` UUID + `organization_id` tag) is attached in `get_current_user` (backend) and via a small client component mounted in `AppShell` (frontend).

**Tech Stack:** Python 3.12 + FastAPI + `sentry-sdk[fastapi]` 2.x; Next.js 16 (App Router) + `@sentry/nextjs` 9.x.

---

## Reference Documents

- `docs/superpowers/specs/2026-04-28-sentry-monitoring-design.md` — the spec.
- `apps/api/src/grade_sight_api/main.py` — FastAPI entry point; `setup_sentry()` is called here before `app = FastAPI(...)`.
- `apps/api/src/grade_sight_api/auth/dependencies.py` — `get_current_user`; user context is set after the User row resolves.
- `apps/api/src/grade_sight_api/services/_logging.py` — pattern for service-layer single-purpose modules.
- `apps/api/tests/auth/test_lazy_upsert_cleanup.py` — pattern for FastAPI auth tests with `MagicMock`/`AsyncMock`.
- `apps/api/tests/conftest.py` — fixture conventions (`async_engine`, `async_session`).
- `apps/web/components/app-shell.tsx` — `AppShell` server component; gets two new props.
- `apps/web/lib/api.ts` — `fetchMe()` returns `UserResponse` with `id: string` + `organization: { id, ... } | null`.
- `apps/web/app/error.tsx` — global error boundary; gets `Sentry.captureException(error)` added inside existing `useEffect`.
- `apps/web/env.ts` — `@t3-oss/env-nextjs` schema; `NEXT_PUBLIC_SENTRY_DSN` is added as optional.
- `apps/web/next.config.ts` — wrapped with `withSentryConfig` for source-map upload.
- `apps/web/vitest.config.ts` — vitest runs `**/*.test.ts` files in jsdom.
- `CLAUDE.md` §1 (current phase), §4 (privacy commitments), §5 (scope gates) — all three get edits.

## Pre-merge checklist (every task)

1. `cd apps/api && ~/.local/bin/uv run ruff check` — clean.
2. `cd apps/api && ~/.local/bin/uv run mypy src tests` — clean.
3. `cd apps/api && ~/.local/bin/uv run pytest -q` — all default tests pass.
4. `cd apps/web && pnpm lint && pnpm typecheck && pnpm test` — clean (frontend tasks).
5. Commit: imperative subject, body explains *why*, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Build-broken intermediate state

All nine tasks are additive. Backend Tasks 1–3 add new modules and one-line wires into existing entry points. The init gate means the SDK is a no-op until `SENTRY_DSN` is set in a production env, so dev environments are unchanged. Frontend Tasks 4–7 add new files, optional env vars, and a wrapped `next.config.ts` — local builds succeed without the auth token. Existing tests and routes continue to pass throughout.

---

## Task 1: Backend dependencies, config, scrubber module + tests

**Files:**
- Modify: `apps/api/pyproject.toml` (add `sentry-sdk[fastapi]`)
- Modify: `apps/api/src/grade_sight_api/config.py` (add optional `sentry_dsn`)
- Modify: `apps/api/.env.example` (uncomment `SENTRY_DSN=` + prod-only comment)
- Create: `apps/api/src/grade_sight_api/services/sentry_scrubber.py`
- Create: `apps/api/tests/services/test_sentry_scrubber.py`

- [ ] **Step 1: Add the dependency**

Edit `apps/api/pyproject.toml`. In the `dependencies` array, after `"aioboto3>=13.0.0",`, add:

```toml
    "sentry-sdk[fastapi]>=2.18.0",
```

Then run:

```bash
cd apps/api && ~/.local/bin/uv sync
```

Expected: `Resolved N packages` with `sentry-sdk` and its FastAPI extras installed.

- [ ] **Step 2: Add the `sentry_dsn` setting**

In `apps/api/src/grade_sight_api/config.py`, add the new field after the existing `r2_endpoint_url: str` line:

```python
    sentry_dsn: str | None = None
```

Final `Settings` class block (showing context):

```python
    r2_endpoint_url: str

    sentry_dsn: str | None = None
```

- [ ] **Step 3: Update `.env.example`**

In `apps/api/.env.example`, change the existing futures block:

```
# Future (uncomment when their spec lands):
# ANTHROPIC_API_KEY=
# SENTRY_DSN=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

to:

```
# Sentry — set ONLY in production. SDK is a no-op when ENVIRONMENT != production.
# Browser-safe by Sentry's design (write-only ingestion endpoint), but we still
# scope frontend access via the NEXT_PUBLIC_ var on the web side.
SENTRY_DSN=

# Future (uncomment when their spec lands):
# ANTHROPIC_API_KEY=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

- [ ] **Step 4: Write the failing scrubber tests**

Create `apps/api/tests/services/test_sentry_scrubber.py`:

```python
"""Tests for the Sentry before_send scrubber.

Each test feeds a synthetic Sentry event through scrub_event() and asserts
PII shapes are removed while non-PII fields are preserved. The scrubber must
also fail safe — return None to drop the event if scrubbing itself raises.
"""

from __future__ import annotations

from typing import Any

from grade_sight_api.services.sentry_scrubber import scrub_event


def test_scrub_strips_request_headers() -> None:
    event: dict[str, Any] = {
        "request": {
            "headers": {"authorization": "Bearer abc", "cookie": "session=xyz"},
            "url": "https://api.example.com/api/assessments",
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "headers" not in cleaned["request"]
    assert cleaned["request"]["url"] == "https://api.example.com/api/assessments"


def test_scrub_strips_request_cookies() -> None:
    event: dict[str, Any] = {"request": {"cookies": {"__session": "abc123"}}}
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "cookies" not in cleaned["request"]


def test_scrub_strips_request_body() -> None:
    event: dict[str, Any] = {
        "request": {
            "data": {"student_name": "Lily Smith", "original_filename": "Lily_Algebra2.pdf"}
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "data" not in cleaned["request"]


def test_scrub_strips_query_string() -> None:
    event: dict[str, Any] = {"request": {"query_string": "student_email=lily@example.com"}}
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "query_string" not in cleaned["request"]


def test_scrub_strips_emails_in_messages() -> None:
    event: dict[str, Any] = {
        "logentry": {"formatted": "Failed to send to lily@example.com"}
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "lily@example.com" not in cleaned["logentry"]["formatted"]


def test_scrub_strips_r2_presigned_urls() -> None:
    event: dict[str, Any] = {
        "logentry": {
            "formatted": "Upload failed: https://abc.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=foo"
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "r2.cloudflarestorage.com" not in cleaned["logentry"]["formatted"]


def test_scrub_strips_image_frame_vars_in_claude_service() -> None:
    event: dict[str, Any] = {
        "exception": {
            "values": [
                {
                    "stacktrace": {
                        "frames": [
                            {
                                "module": "grade_sight_api.services.claude_service",
                                "function": "call_vision",
                                "vars": {
                                    "image": "<base64 megabytes>",
                                    "prompt": "Grade this work",
                                    "system": "You are a math grader",
                                    "model": "claude-sonnet-4-6",
                                },
                            }
                        ]
                    }
                }
            ]
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    frame = cleaned["exception"]["values"][0]["stacktrace"]["frames"][0]
    assert "image" not in frame["vars"]
    assert "prompt" not in frame["vars"]
    assert "system" not in frame["vars"]
    # Non-PII frame var preserved
    assert frame["vars"]["model"] == "claude-sonnet-4-6"


def test_scrub_strips_user_email_username_ip() -> None:
    event: dict[str, Any] = {
        "user": {
            "id": "00000000-0000-0000-0000-000000000001",
            "email": "lily@example.com",
            "username": "lily.smith",
            "ip_address": "203.0.113.5",
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert cleaned["user"] == {"id": "00000000-0000-0000-0000-000000000001"}


def test_scrub_preserves_non_pii_fields() -> None:
    event: dict[str, Any] = {
        "tags": {"environment": "production", "release": "abc123", "service": "api"},
        "level": "error",
        "exception": {"values": [{"type": "ValueError", "value": "bad input"}]},
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert cleaned["tags"]["release"] == "abc123"
    assert cleaned["exception"]["values"][0]["type"] == "ValueError"


def test_scrub_returns_none_on_internal_exception() -> None:
    # Pathological input: scrubber's regex paths assume strings; force a TypeError.
    event: object = ["not", "a", "dict"]
    cleaned = scrub_event(event, hint={})  # type: ignore[arg-type]
    assert cleaned is None
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd apps/api && ~/.local/bin/uv run pytest tests/services/test_sentry_scrubber.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'grade_sight_api.services.sentry_scrubber'`.

- [ ] **Step 6: Implement the scrubber**

Create `apps/api/src/grade_sight_api/services/sentry_scrubber.py`:

```python
"""Sentry before_send hook — strips PII before any event leaves the process.

Applied via sentry_sdk.init(before_send=scrub_event). Returns None to drop
the event entirely if scrubbing itself raises (better to lose an error
than leak PII).

What this strips:
- request headers/cookies/body/query_string (all bulk-removed)
- email-shaped strings anywhere in messages
- presigned R2 URLs anywhere in messages
- frame vars 'image', 'images', 'prompt', 'system' in claude_service frames
- user.email / user.username / user.ip_address (only user.id allowed)

What this preserves:
- stack traces, exception types, non-PII frame vars
- tags (environment, release, service)
- user.id (pseudonymous UUID)
- breadcrumbs (handled by send_default_pii=False at init time)
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_R2_URL_RE = re.compile(r"https://[A-Za-z0-9.\-]+\.r2\.cloudflarestorage\.com/\S*")
_PII_FRAME_VARS = frozenset({"image", "images", "prompt", "system"})
_CLAUDE_SERVICE_MODULE = "grade_sight_api.services.claude_service"


def _redact_string(s: str) -> str:
    s = _EMAIL_RE.sub("[redacted-email]", s)
    s = _R2_URL_RE.sub("[redacted-r2-url]", s)
    return s


def scrub_event(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Strip PII from a Sentry event in-place and return it. Drop on error."""
    try:
        # 1. Bulk-remove request body fields that may contain PII.
        request = event.get("request")
        if isinstance(request, dict):
            for key in ("headers", "cookies", "data", "query_string"):
                request.pop(key, None)

        # 2. Strip non-allowlisted user fields. Only user.id survives.
        user = event.get("user")
        if isinstance(user, dict):
            user_id = user.get("id")
            event["user"] = {"id": user_id} if user_id is not None else {}

        # 3. Redact email + R2 URL patterns from logentry.formatted/message.
        logentry = event.get("logentry")
        if isinstance(logentry, dict):
            for key in ("formatted", "message"):
                value = logentry.get(key)
                if isinstance(value, str):
                    logentry[key] = _redact_string(value)

        # 4. Remove PII-shaped frame vars in claude_service frames.
        exc = event.get("exception")
        if isinstance(exc, dict):
            values = exc.get("values")
            if isinstance(values, list):
                for value in values:
                    if not isinstance(value, dict):
                        continue
                    stacktrace = value.get("stacktrace")
                    if not isinstance(stacktrace, dict):
                        continue
                    frames = stacktrace.get("frames")
                    if not isinstance(frames, list):
                        continue
                    for frame in frames:
                        if not isinstance(frame, dict):
                            continue
                        frame_vars = frame.get("vars")
                        if isinstance(frame_vars, dict):
                            module = frame.get("module") or ""
                            if module == _CLAUDE_SERVICE_MODULE:
                                for var_name in list(frame_vars.keys()):
                                    if var_name in _PII_FRAME_VARS:
                                        frame_vars.pop(var_name)

        return event
    except Exception:
        logger.warning("sentry scrub_event raised; dropping event", exc_info=True)
        return None
```

- [ ] **Step 7: Run scrubber tests to verify they pass**

```bash
cd apps/api && ~/.local/bin/uv run pytest tests/services/test_sentry_scrubber.py -v
```

Expected: 10 passed.

- [ ] **Step 8: Run full pre-merge checklist**

```bash
cd apps/api && ~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests && ~/.local/bin/uv run pytest -q
```

Expected: clean across the board.

- [ ] **Step 9: Commit**

```bash
git add apps/api/pyproject.toml apps/api/uv.lock apps/api/src/grade_sight_api/config.py apps/api/.env.example apps/api/src/grade_sight_api/services/sentry_scrubber.py apps/api/tests/services/test_sentry_scrubber.py
git commit -m "$(cat <<'EOF'
Add Sentry SDK + PII scrubber (Spec 13 Task 1)

Adds sentry-sdk[fastapi] dependency, optional sentry_dsn config setting,
and the before_send scrubber that strips PII shapes (request headers/
bodies/cookies/query strings, emails, presigned R2 URLs, claude_service
frame vars, user email/username/ip) while preserving stack traces and
the pseudonymous user.id UUID.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend init module + wire into main.py

**Files:**
- Create: `apps/api/src/grade_sight_api/services/sentry_init.py`
- Create: `apps/api/tests/services/test_sentry_init.py`
- Modify: `apps/api/src/grade_sight_api/main.py` (call `setup_sentry()` before `app = FastAPI(...)`)

- [ ] **Step 1: Write the failing init tests**

Create `apps/api/tests/services/test_sentry_init.py`:

```python
"""Tests for the Sentry init gate.

setup_sentry() must be a no-op unless ENVIRONMENT == "production" AND
SENTRY_DSN is set. We mock sentry_sdk.init and assert call/no-call.
"""

from __future__ import annotations

import os
from unittest.mock import patch

from grade_sight_api.services import sentry_init


def test_setup_sentry_noop_when_dsn_missing() -> None:
    with patch.object(sentry_init.sentry_sdk, "init") as mock_init:
        sentry_init.setup_sentry(environment="production", dsn=None)
        mock_init.assert_not_called()


def test_setup_sentry_noop_when_environment_not_production() -> None:
    with patch.object(sentry_init.sentry_sdk, "init") as mock_init:
        sentry_init.setup_sentry(environment="development", dsn="https://x@o0.ingest.us.sentry.io/1")
        mock_init.assert_not_called()


def test_setup_sentry_initializes_when_both_present() -> None:
    with patch.object(sentry_init.sentry_sdk, "init") as mock_init:
        sentry_init.setup_sentry(
            environment="production",
            dsn="https://x@o0.ingest.us.sentry.io/1",
        )
        mock_init.assert_called_once()
        kwargs = mock_init.call_args.kwargs
        assert kwargs["dsn"] == "https://x@o0.ingest.us.sentry.io/1"
        assert kwargs["environment"] == "production"
        assert kwargs["traces_sample_rate"] == 0.1
        assert kwargs["send_default_pii"] is False
        assert kwargs["before_send"] is sentry_init.scrub_event


def test_setup_sentry_release_from_railway_env() -> None:
    with (
        patch.object(sentry_init.sentry_sdk, "init") as mock_init,
        patch.dict(os.environ, {"RAILWAY_GIT_COMMIT_SHA": "abc123def"}, clear=False),
    ):
        sentry_init.setup_sentry(
            environment="production",
            dsn="https://x@o0.ingest.us.sentry.io/1",
        )
        kwargs = mock_init.call_args.kwargs
        assert kwargs["release"] == "abc123def"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && ~/.local/bin/uv run pytest tests/services/test_sentry_init.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the init module**

Create `apps/api/src/grade_sight_api/services/sentry_init.py`:

```python
"""Sentry initialization, gated on ENVIRONMENT=production AND SENTRY_DSN set.

setup_sentry() is called once from main.py before the FastAPI app is built.
When the gate fails, sentry_sdk.init() is never called — no transport, no
breadcrumbs, no events.

Uses sentry_sdk's auto-enabling integrations (FastAPI, AsyncPG, SQLAlchemy
auto-detect when their packages are present), with our before_send scrubber
applied to every event.
"""

from __future__ import annotations

import logging
import os

import sentry_sdk

from .sentry_scrubber import scrub_event

logger = logging.getLogger(__name__)


def setup_sentry(*, environment: str, dsn: str | None) -> None:
    """Initialize Sentry only when running in production with a DSN set."""
    if environment != "production":
        logger.info("Sentry init skipped: environment=%s (not production)", environment)
        return
    if not dsn:
        logger.info("Sentry init skipped: SENTRY_DSN not set")
        return

    release = os.environ.get("RAILWAY_GIT_COMMIT_SHA")
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=scrub_event,
    )
    sentry_sdk.set_tag("service", "api")
    logger.info("Sentry initialized: environment=%s release=%s", environment, release)
```

- [ ] **Step 4: Run init tests to verify they pass**

```bash
cd apps/api && ~/.local/bin/uv run pytest tests/services/test_sentry_init.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Wire into main.py**

In `apps/api/src/grade_sight_api/main.py`, add the import and the setup call. After the existing `from .db import engine, get_session` line, add:

```python
from .services.sentry_init import setup_sentry
```

Then **before** the `app = FastAPI(...)` line (line 32 currently), add:

```python
setup_sentry(environment=settings.environment, dsn=settings.sentry_dsn)

```

So the relevant section becomes:

```python
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Dispose of the async engine cleanly on shutdown."""
    try:
        yield
    finally:
        await engine.dispose()


setup_sentry(environment=settings.environment, dsn=settings.sentry_dsn)

app = FastAPI(title="Grade-Sight API", version="0.0.0", lifespan=lifespan)
```

- [ ] **Step 6: Run full pre-merge checklist**

```bash
cd apps/api && ~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests && ~/.local/bin/uv run pytest -q
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/grade_sight_api/services/sentry_init.py apps/api/tests/services/test_sentry_init.py apps/api/src/grade_sight_api/main.py
git commit -m "$(cat <<'EOF'
Wire Sentry init into FastAPI app entry (Spec 13 Task 2)

Adds setup_sentry() with the production-only init gate (no-op unless
ENVIRONMENT=production AND SENTRY_DSN is set). Pulls the Railway commit
SHA as the release identifier. Applies the scrubber as before_send and
sets traces_sample_rate=0.1 + send_default_pii=False as belt + suspenders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend user-context attachment in `get_current_user`

**Files:**
- Modify: `apps/api/src/grade_sight_api/auth/dependencies.py` (call `set_user` + `set_tag` after User resolves)
- Create: `apps/api/tests/auth/test_sentry_user_context.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/auth/test_sentry_user_context.py`:

```python
"""Verify get_current_user attaches pseudonymous user context to Sentry.

Sentry receives the internal User.id UUID and an organization_id tag — never
email, username, or other PII. Test patches sentry_sdk.set_user / set_tag and
asserts call args.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import UUID

from grade_sight_api.auth import dependencies


def test_attach_sentry_user_context_sets_id_only() -> None:
    user = MagicMock()
    user.id = UUID("11111111-1111-1111-1111-111111111111")
    user.organization_id = UUID("22222222-2222-2222-2222-222222222222")

    with (
        patch.object(dependencies.sentry_sdk, "set_user") as mock_set_user,
        patch.object(dependencies.sentry_sdk, "set_tag") as mock_set_tag,
    ):
        dependencies._attach_sentry_user_context(user)

    mock_set_user.assert_called_once_with({"id": "11111111-1111-1111-1111-111111111111"})
    mock_set_tag.assert_called_once_with(
        "organization_id", "22222222-2222-2222-2222-222222222222"
    )


def test_attach_sentry_user_context_handles_null_organization() -> None:
    user = MagicMock()
    user.id = UUID("11111111-1111-1111-1111-111111111111")
    user.organization_id = None

    with (
        patch.object(dependencies.sentry_sdk, "set_user") as mock_set_user,
        patch.object(dependencies.sentry_sdk, "set_tag") as mock_set_tag,
    ):
        dependencies._attach_sentry_user_context(user)

    mock_set_user.assert_called_once_with({"id": "11111111-1111-1111-1111-111111111111"})
    mock_set_tag.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && ~/.local/bin/uv run pytest tests/auth/test_sentry_user_context.py -v
```

Expected: FAIL with `AttributeError: module ... has no attribute 'sentry_sdk'`.

- [ ] **Step 3: Implement the helper + wire into `get_current_user`**

In `apps/api/src/grade_sight_api/auth/dependencies.py`:

(a) Add the import near the other top-level imports (after `import stripe`):

```python
import sentry_sdk
```

(b) Below `_extract_unsafe_metadata` and above `_cleanup_partial_lazy_upsert`, add:

```python
def _attach_sentry_user_context(user: User) -> None:
    """Attach pseudonymous user context to the current Sentry scope.

    Only the internal User.id UUID and organization_id are sent — no email,
    no name, no Clerk identifiers. Sentry's hub model scopes this to the
    current request, so values don't leak across requests.
    """
    sentry_sdk.set_user({"id": str(user.id)})
    if user.organization_id is not None:
        sentry_sdk.set_tag("organization_id", str(user.organization_id))
```

(c) In `get_current_user`, after the existing-user branch returns and after the new-user branch creates the new user, attach context. The cleanest spot is to attach right before each return:

Find the existing block:

```python
    if existing is not None:
        changed = False
        if email and existing.email != email:
            existing.email = email
            changed = True
        if first_name != existing.first_name:
            existing.first_name = first_name
            changed = True
        if last_name != existing.last_name:
            existing.last_name = last_name
            changed = True
        if changed:
            await db.flush()
        return existing
```

Replace the `return existing` with:

```python
        if changed:
            await db.flush()
        _attach_sentry_user_context(existing)
        return existing
```

Find the second early-return inside the lock-acquired block:

```python
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing
```

Replace with:

```python
    existing = result.scalar_one_or_none()
    if existing is not None:
        _attach_sentry_user_context(existing)
        return existing
```

Find the final return at the end of the function:

```python
    logger.info(
        "Lazy upsert created org=%s user=%s role=%s plan=%s",
        new_org.id,
        new_user.id,
        role.value,
        plan.value,
    )
    return new_user
```

Replace `return new_user` with:

```python
    _attach_sentry_user_context(new_user)
    return new_user
```

- [ ] **Step 4: Run user-context tests to verify they pass**

```bash
cd apps/api && ~/.local/bin/uv run pytest tests/auth/test_sentry_user_context.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Run full pre-merge checklist**

```bash
cd apps/api && ~/.local/bin/uv run ruff check && ~/.local/bin/uv run mypy src tests && ~/.local/bin/uv run pytest -q
```

Expected: clean. The pre-existing lazy-upsert tests must still pass (they don't touch Sentry; the `_attach_sentry_user_context` calls are no-ops in tests because `sentry_sdk.init` was never called).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grade_sight_api/auth/dependencies.py apps/api/tests/auth/test_sentry_user_context.py
git commit -m "$(cat <<'EOF'
Attach pseudonymous user context to Sentry in get_current_user (Spec 13 Task 3)

After the User row resolves (existing user, post-lock-existing user, or
freshly-created user), call sentry_sdk.set_user({id: str(user.id)}) and
sentry_sdk.set_tag("organization_id", str(user.organization_id)). No
email, name, or Clerk ID is ever sent to Sentry — only the internal UUIDs
we own. Per-request scope via Sentry's hub model.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend dependencies + env + scrubber + tests

**Files:**
- Modify: `apps/web/package.json` (add `@sentry/nextjs`)
- Modify: `apps/web/env.ts` (add `NEXT_PUBLIC_SENTRY_DSN` optional)
- Create: `apps/web/lib/sentry-scrubber.ts`
- Create: `apps/web/lib/__tests__/sentry-scrubber.test.ts`

- [ ] **Step 1: Add the dependency**

```bash
cd apps/web && pnpm add @sentry/nextjs@^9.0.0
```

Expected: `@sentry/nextjs` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Add `NEXT_PUBLIC_SENTRY_DSN` to env schema**

In `apps/web/env.ts`, edit the `client` block to include the new optional var:

```ts
  client: {
    NEXT_PUBLIC_API_URL: z.string().url(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().default("/dashboard"),
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().default("/dashboard"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
```

And in the `runtimeEnv` block, add the matching line:

```ts
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
```

- [ ] **Step 3: Write the failing scrubber tests**

Create `apps/web/lib/__tests__/sentry-scrubber.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/lib/sentry-scrubber";

describe("scrubEvent", () => {
  it("strips request headers", () => {
    const cleaned = scrubEvent({
      request: {
        headers: { authorization: "Bearer abc", cookie: "session=xyz" },
        url: "https://app.example.com/dashboard",
      },
    });
    expect(cleaned).not.toBeNull();
    expect(cleaned?.request?.headers).toBeUndefined();
    expect(cleaned?.request?.url).toBe("https://app.example.com/dashboard");
  });

  it("strips request cookies", () => {
    const cleaned = scrubEvent({
      request: { cookies: { __session: "abc" } },
    });
    expect(cleaned?.request?.cookies).toBeUndefined();
  });

  it("strips request body data", () => {
    const cleaned = scrubEvent({
      request: { data: { student_name: "Lily", original_filename: "Lily.pdf" } },
    });
    expect(cleaned?.request?.data).toBeUndefined();
  });

  it("strips query strings", () => {
    const cleaned = scrubEvent({
      request: { query_string: "email=lily@example.com" },
    });
    expect(cleaned?.request?.query_string).toBeUndefined();
  });

  it("redacts emails in messages", () => {
    const cleaned = scrubEvent({
      message: "Failed to send to lily@example.com — retrying",
    });
    expect(cleaned?.message).not.toContain("lily@example.com");
    expect(cleaned?.message).toContain("[redacted-email]");
  });

  it("redacts presigned R2 URLs in messages", () => {
    const cleaned = scrubEvent({
      message:
        "Upload error: https://abc.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=foo",
    });
    expect(cleaned?.message).not.toContain("r2.cloudflarestorage.com");
  });

  it("preserves user.id and strips email/username/ip", () => {
    const cleaned = scrubEvent({
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "lily@example.com",
        username: "lily.smith",
        ip_address: "203.0.113.5",
      },
    });
    expect(cleaned?.user).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("preserves non-PII fields", () => {
    const cleaned = scrubEvent({
      tags: { environment: "production", release: "abc", service: "web" },
      level: "error",
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    });
    expect(cleaned?.tags?.release).toBe("abc");
    expect(cleaned?.exception?.values?.[0]?.type).toBe("TypeError");
  });

  it("returns null when scrub itself throws", () => {
    // Force scrubber failure: feed a non-object to the regex code path.
    const cleaned = scrubEvent(null as unknown as Record<string, unknown>);
    expect(cleaned).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd apps/web && pnpm test -- --run lib/__tests__/sentry-scrubber.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/sentry-scrubber'`.

- [ ] **Step 5: Implement the scrubber**

Create `apps/web/lib/sentry-scrubber.ts`:

```ts
/**
 * Sentry beforeSend hook for the Next.js app — strips PII before any event
 * leaves the browser/server.
 *
 * Mirrors the backend scrubber at apps/api/.../sentry_scrubber.py. Returns
 * null to drop the event entirely if scrubbing itself raises.
 */

type SentryEvent = Record<string, unknown>;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const R2_URL_RE = /https:\/\/[A-Za-z0-9.\-]+\.r2\.cloudflarestorage\.com\/\S*/g;

function redactString(s: string): string {
  return s.replace(EMAIL_RE, "[redacted-email]").replace(R2_URL_RE, "[redacted-r2-url]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scrubEvent(event: SentryEvent): SentryEvent | null {
  try {
    if (!isRecord(event)) {
      throw new TypeError("event is not a record");
    }

    // 1. Bulk-remove request body fields.
    const request = event.request;
    if (isRecord(request)) {
      delete request.headers;
      delete request.cookies;
      delete request.data;
      delete request.query_string;
    }

    // 2. Strip non-allowlisted user fields.
    const user = event.user;
    if (isRecord(user)) {
      const id = user.id;
      event.user = id !== undefined ? { id } : {};
    }

    // 3. Redact email + R2 URL patterns from message.
    if (typeof event.message === "string") {
      event.message = redactString(event.message);
    }

    return event;
  } catch (e) {
    // Console-only; we intentionally do NOT capture this back to Sentry to
    // avoid loops. Lost events are safer than leaked PII.
    // eslint-disable-next-line no-console
    console.warn("sentry scrubEvent raised; dropping event", e);
    return null;
  }
}
```

- [ ] **Step 6: Run scrubber tests to verify they pass**

```bash
cd apps/web && pnpm test -- --run lib/__tests__/sentry-scrubber.test.ts
```

Expected: 9 passed.

- [ ] **Step 7: Run frontend pre-merge checklist**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/env.ts apps/web/lib/sentry-scrubber.ts apps/web/lib/__tests__/sentry-scrubber.test.ts
git commit -m "$(cat <<'EOF'
Add @sentry/nextjs + frontend PII scrubber (Spec 13 Task 4)

Adds the SDK dependency, NEXT_PUBLIC_SENTRY_DSN to the env schema, and
the beforeSend scrubber mirroring the backend's deny-list (request
body/headers/cookies/query, emails, presigned R2 URLs, user fields
beyond .id). Console-warn-and-drop on internal scrubber failure to
avoid Sentry-loop on errors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend instrumentation files + next.config wrap

**Files:**
- Create: `apps/web/instrumentation.ts`
- Create: `apps/web/instrumentation-client.ts`
- Modify: `apps/web/next.config.ts` (wrap with `withSentryConfig`)

- [ ] **Step 1: Create the server-side instrumentation file**

Create `apps/web/instrumentation.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrubber";

export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const environment = process.env.NODE_ENV;

  if (environment !== "production" || !dsn) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn,
      environment,
      release: process.env.RAILWAY_GIT_COMMIT_SHA,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend: (event) =>
        scrubEvent(event as unknown as Record<string, unknown>) as typeof event | null,
    });
    Sentry.setTag("service", "web-server");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 2: Create the client-side instrumentation file**

Create `apps/web/instrumentation-client.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrubber";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NODE_ENV;

if (environment === "production" && dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) =>
      scrubEvent(event as unknown as Record<string, unknown>) as typeof event | null,
  });
  Sentry.setTag("service", "web-client");
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 3: Wrap `next.config.ts` for source-map upload**

Replace the entire contents of `apps/web/next.config.ts` with:

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // The org and project names are the Sentry-side identifiers. They are
  // hardcoded so a missing env var doesn't silently disable source-map
  // upload — when SENTRY_AUTH_TOKEN is unset, the wrapper logs a warning
  // and skips upload but the build still succeeds.
  org: process.env.SENTRY_ORG ?? "grade-sight",
  project: process.env.SENTRY_PROJECT ?? "grade-sight-web",
  silent: !process.env.CI,
  // Only upload source maps when the auth token is present (Railway/CI).
  // Local builds skip upload but still emit maps for in-browser debugging.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Hide source map files from public access after upload (the maps are
  // uploaded to Sentry, then deleted from .next/static so they aren't
  // served to browsers).
  hideSourceMaps: true,
  disableLogger: true,
});
```

- [ ] **Step 4: Verify the build succeeds without auth token**

```bash
cd apps/web && pnpm build
```

Expected: build completes. With no `SENTRY_AUTH_TOKEN`, you'll see a warning like `[@sentry/nextjs] No SENTRY_AUTH_TOKEN found — skipping source map upload`. That's the desired behavior — non-CI environments build without uploading.

- [ ] **Step 5: Run frontend pre-merge checklist**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/instrumentation.ts apps/web/instrumentation-client.ts apps/web/next.config.ts
git commit -m "$(cat <<'EOF'
Wire Next.js instrumentation + source-map upload (Spec 13 Task 5)

Adds instrumentation.ts (server runtime) and instrumentation-client.ts
(browser) following the Next.js 16 pattern, both gated on production +
NEXT_PUBLIC_SENTRY_DSN. Wraps next.config.ts with withSentryConfig for
source-map upload on builds where SENTRY_AUTH_TOKEN is set (Railway/CI);
local builds emit source maps but skip upload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: SentryUserSync component + AppShell threading

**Files:**
- Create: `apps/web/components/sentry-user-sync.tsx`
- Modify: `apps/web/components/app-shell.tsx` (accept new props, render `SentryUserSync`)
- Modify: `apps/web/app/dashboard/page.tsx`, `apps/web/app/upload/page.tsx`, `apps/web/app/students/page.tsx`, `apps/web/app/paywall/page.tsx`, `apps/web/app/settings/billing/page.tsx`, `apps/web/app/assessments/[id]/page.tsx` (pass `userId` + `organizationId` to `AppShell`)

- [ ] **Step 1: Create `SentryUserSync` client component**

Create `apps/web/components/sentry-user-sync.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface SentryUserSyncProps {
  userId: string;
  organizationId: string | null;
}

export function SentryUserSync({ userId, organizationId }: SentryUserSyncProps) {
  useEffect(() => {
    Sentry.setUser({ id: userId });
    if (organizationId !== null) {
      Sentry.setTag("organization_id", organizationId);
    }
  }, [userId, organizationId]);

  return null;
}
```

- [ ] **Step 2: Extend `AppShell` to accept and render the props**

Replace the contents of `apps/web/components/app-shell.tsx` with:

```tsx
import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { SentryUserSync } from "./sentry-user-sync";

export function AppShell({
  children,
  orgName,
  userId,
  organizationId,
}: {
  children: ReactNode;
  orgName?: string | null;
  userId: string;
  organizationId: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SentryUserSync userId={userId} organizationId={organizationId} />
      <AppHeader orgName={orgName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Update each calling page**

For each of the six pages below, find the `<AppShell ...>` opening tag and add the two new props. The pattern is the same in all six files: each already has a `user` from `fetchMe()` in scope.

**`apps/web/app/dashboard/page.tsx`** — find:

```tsx
<AppShell orgName={user.organization?.name}>
```

Replace with:

```tsx
<AppShell
  orgName={user.organization?.name}
  userId={user.id}
  organizationId={user.organization?.id ?? null}
>
```

**`apps/web/app/upload/page.tsx`** — apply the same change.

**`apps/web/app/students/page.tsx`** — apply the same change.

**`apps/web/app/paywall/page.tsx`** — apply the same change.

**`apps/web/app/settings/billing/page.tsx`** — apply the same change.

**`apps/web/app/assessments/[id]/page.tsx`** — apply the same change.

If any of those pages doesn't currently render `<AppShell ...>`, leave it alone — the spec said "pages that already use AppShell."

- [ ] **Step 4: Run frontend pre-merge checklist**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

Expected: clean. TypeScript will catch any pages where the new required props weren't threaded through; fix any that surface (they should all be in the six pages listed above).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sentry-user-sync.tsx apps/web/components/app-shell.tsx apps/web/app/dashboard/page.tsx apps/web/app/upload/page.tsx apps/web/app/students/page.tsx apps/web/app/paywall/page.tsx apps/web/app/settings/billing/page.tsx apps/web/app/assessments/[id]/page.tsx
git commit -m "$(cat <<'EOF'
Attach pseudonymous user context on the frontend (Spec 13 Task 6)

AppShell now accepts userId + organizationId (sourced from fetchMe()'s
internal UUIDs — never email or name). It renders <SentryUserSync>, a
small client component that calls Sentry.setUser + setTag inside a
useEffect (no SSR, no hydration leak). All six authenticated pages
thread the props through.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend `error.tsx` Sentry capture

**Files:**
- Modify: `apps/web/app/error.tsx` (call `Sentry.captureException(error)` inside existing `useEffect`)

- [ ] **Step 1: Add the import + capture call**

In `apps/web/app/error.tsx`, replace the file contents with:

```tsx
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="max-w-[640px]">
      <SectionEyebrow>Something went wrong</SectionEyebrow>
      <div className="mt-4 mb-4">
        <SerifHeadline level="page" as="h1">
          We couldn&apos;t load that.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-base text-ink-soft">
        The error has been logged. Try once more — if it sticks, let us know
        and include the reference below.
      </p>
      {error.digest && (
        <p className="mb-8 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Reference: {error.digest}
        </p>
      )}
      <Button onClick={reset}>Try again</Button>
    </PageContainer>
  );
}
```

The only changes vs the current file: added `import * as Sentry from "@sentry/nextjs";` and `Sentry.captureException(error);` as the first line in `useEffect`.

- [ ] **Step 2: Run frontend pre-merge checklist**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/error.tsx
git commit -m "$(cat <<'EOF'
Capture render errors to Sentry from the global error boundary (Spec 13 Task 7)

app/error.tsx already runs useEffect on every error to log to console.
Adding Sentry.captureException(error) at the top of that effect routes
unhandled render errors to Sentry while preserving the existing UX
(reference: digest, Try-again button).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Documentation updates (CLAUDE.md + PROJECT_BRIEF TODO)

**Files:**
- Modify: `CLAUDE.md` (§1 phase tick when this spec lands, §4 privacy line, §5 scope gate)
- Modify: `docs/PROJECT_BRIEF.md` (TODO marker for subprocessor-list update)

- [ ] **Step 1: Add the privacy line to CLAUDE.md §4**

In `CLAUDE.md`, find the section beginning `## 4. Privacy hard commitments (must not be violated)`. After the existing line:

```
- 72-hour incident notification
```

Add a new bullet:

```
- Pseudonymous error diagnostics (internal user/org UUIDs only — no names, emails, or student work) shared with our error-tracking subprocessor solely to keep the platform reliable and secure
```

- [ ] **Step 2: Add the scope gate to CLAUDE.md §5**

In `CLAUDE.md`, find the section beginning `## 5. Do NOT yet (active scope gates)`. After the existing bullet list (e.g. after `- Do not build batch upload, ...`), add:

```
- Do not enable Sentry Session Replay — privacy risk requires explicit review
```

- [ ] **Step 3: Update CLAUDE.md §1 current phase**

In `CLAUDE.md`, find the line in §1 that lists completed specs:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), 9 (assessment upload UI shell), 10 (multi-page assessment upload), and 11 (diagnostic engine v1) complete. Next: answer key upload (Spec 12).
```

Replace with:

```
**Current phase:** Phase 1 MVP — Specs 1 (scaffolding), 2 (DB schema + migrations), 3 (Clerk auth integration), 4 (Stripe billing integration), 5 (external service abstraction layer), 6 (lazy-upsert cleanup), 7 (error taxonomy v1), 8 (taxonomy schema + seeding), 9 (assessment upload UI shell), 10 (multi-page assessment upload), 11 (diagnostic engine v1), 12 (answer key + engine modes), and 13 (Sentry monitoring) complete. Next: navigation + UX pass (incoming design handoff).
```

- [ ] **Step 4: Add subprocessor TODO to PROJECT_BRIEF**

In `docs/PROJECT_BRIEF.md`, find line 81:

```
- Published subprocessor list, 30-day change notification
```

Add an HTML comment immediately after that line (so it's visible in the source but doesn't render in most viewers):

```
<!-- TODO (Spec 13 Sentry monitoring): when the public subprocessor list is drafted with edtech counsel, include Sentry alongside Anthropic, Cloudflare, Clerk, Stripe, Resend, Railway. Add the pseudonymous-diagnostics paragraph (CLAUDE.md §4) to the privacy policy at the same time. -->
```

- [ ] **Step 5: Verify changes**

```bash
git diff CLAUDE.md docs/PROJECT_BRIEF.md
```

Expected: three additions to `CLAUDE.md` (privacy bullet, scope gate, phase line update) and one addition to `docs/PROJECT_BRIEF.md` (TODO comment).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/PROJECT_BRIEF.md
git commit -m "$(cat <<'EOF'
Update CLAUDE.md + PROJECT_BRIEF for Sentry integration (Spec 13 Task 8)

§4 gains a privacy commitment line covering pseudonymous error
diagnostics. §5 adds a scope gate against enabling Session Replay until
explicit privacy review. §1 phase line ticks Spec 13 complete.
PROJECT_BRIEF gets a TODO marker so Sentry lands on the public
subprocessor list when counsel reviews the public privacy doc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual Railway smoke test runbook (USER-EXECUTED)

**This task is not run by an implementer agent.** It documents the smoke test the user runs after the prior tasks deploy. The agent's job is to confirm the runbook is documented and committed alongside the spec; it does not execute any of the steps below.

**Files:**
- Modify: `docs/superpowers/specs/2026-04-28-sentry-monitoring-design.md` (append a "Smoke runbook" section at the end if not already present — content provided below)

- [ ] **Step 1: Confirm the runbook is captured in the spec**

Open `docs/superpowers/specs/2026-04-28-sentry-monitoring-design.md` and confirm a "Manual smoke (documented in the plan, not automated)" section exists under "Testing." If a more detailed runbook is desired, append the following section at the end of the spec file:

```markdown
## Smoke runbook (user-executed after deploy)

1. **Provision Sentry project** in the Sentry UI: org `grade-sight`, project `grade-sight-web` (or your chosen name; update `SENTRY_PROJECT` env var to match). Choose US data residency.
2. **Set Railway production env vars** for both `apps/api` and `apps/web` services:
   - `SENTRY_DSN` (backend) — from Sentry project settings
   - `NEXT_PUBLIC_SENTRY_DSN` (frontend) — same DSN value
   - `SENTRY_AUTH_TOKEN` (frontend, build-time) — Sentry org-level auth token, scope: `project:write`
   - `SENTRY_ORG` and `SENTRY_PROJECT` (frontend, build-time) — match Sentry-side identifiers
   - Confirm `ENVIRONMENT=production` is set on both services
3. **Trigger known backend error.** Add a temporary endpoint to `apps/api/src/grade_sight_api/main.py`:
   ```python
   @app.get("/api/_smoke/raise")
   def smoke_raise() -> None:
       raise RuntimeError("sentry smoke test")
   ```
   Deploy. Hit `https://api.grade-sight.app/api/_smoke/raise`. Expect 500.
4. **Inspect Sentry event:**
   - Stack trace present, points to `main.py`
   - `release` matches deployed commit SHA
   - `service=api` tag present
   - `user.id` UUID present (assuming you hit the route while authenticated; otherwise no user context — that's fine)
   - `organization_id` tag present
   - **No** `user.email`, no `original_filename`, no email-shaped strings, no R2 URLs in the event JSON
5. **Trigger known frontend error.** Temporarily add `throw new Error("sentry frontend smoke")` to a server component you can hit (e.g., `app/dashboard/page.tsx` near the top). Deploy. Hit the page.
6. **Inspect frontend event:**
   - Stack trace deobfuscates to original TSX (source maps were uploaded)
   - `service=web-server` tag present
   - Same scrubbing assertions as step 4
7. **Tear down test triggers:** revert the smoke endpoint and the throw, redeploy, confirm steady state has zero events.
```

- [ ] **Step 2: Commit (only if you appended content in Step 1; otherwise skip)**

```bash
git add docs/superpowers/specs/2026-04-28-sentry-monitoring-design.md
git commit -m "$(cat <<'EOF'
Add explicit smoke runbook section to Spec 13 design (Task 9)

The Testing section already calls out a manual smoke; this expands it
to a numbered runbook a non-implementer can follow end-to-end after
provisioning a Sentry project.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Hand off to user**

The user runs the runbook above against a Railway production deploy. The agent's responsibility ends here — it does **not** create Sentry projects, set env vars, or modify Railway config. If the smoke test surfaces issues (events not arriving, scrubber leaking PII, source maps not deobfuscating), file a follow-up bug or spec.

---

## Acceptance criteria (entire plan)

- All automated tests pass: `pytest -q` in apps/api, `pnpm test` in apps/web, all clean.
- mypy + ruff (backend) and lint + typecheck (frontend) pass.
- Local build works without `SENTRY_AUTH_TOKEN` (skips source-map upload, doesn't fail).
- Local dev with `ENVIRONMENT=development` produces no Sentry events (gate verified by inspecting `setup_sentry()` log output: "Sentry init skipped: environment=development").
- CLAUDE.md §1 phase line ticks Spec 13 complete; §4 gains privacy bullet; §5 gains Session Replay scope gate.
- After user runs the manual smoke (Task 9), a captured Sentry event has the expected shape: stack trace, user.id UUID, organization_id tag, service tag, release SHA, **no PII strings anywhere in the event JSON.**
