# External Service Abstraction Layer — Design

**Spec 5 of Phase 1 MVP**
**Date:** 2026-04-25
**Status:** approved (design)

## Goal

Build the Claude (Anthropic) and storage (Cloudflare R2) service modules that the diagnostic engine and assessment-upload features will consume in later specs. Codify the data-minimization rule from `CLAUDE.md` §3 ("no PII through these layers without an explicit flag") as a typed `CallContext` pattern. Centralize audit and LLM call logging into a single helper module so every external call leaves the same auditable trail.

This is the abstraction layer Stripe service was the seed of. After Spec 5, every external API call in the codebase goes through one of three service modules (`claude_service`, `storage_service`, `stripe_service`), all logging through the same `_logging.py` helper.

## Scope

**In scope:**
- `services/claude_service.py` — Anthropic SDK wrapper, real wire-up, no callers yet
- `services/storage_service.py` — Cloudflare R2 wrapper (S3-compatible), real wire-up, no callers yet
- `services/call_context.py` — `CallContext` dataclass for the data-minimization pattern
- `services/_logging.py` — shared internal helper for `LLMCallLog` + `AuditLog` writes
- Migration of `stripe_service.py`'s audit-log writes onto the shared helper (surgical, no behavior change)
- Smoke tests (real Anthropic + R2 round-trips, gated by `INTEGRATION=1`)
- Unit tests with mocked SDKs

**Out of scope (deferred to later specs):**
- Diagnostic engine prompts, error taxonomy logic, eval set infrastructure
- Assessment upload UI / route handlers
- R2 bucket lifecycle policies (managed in Cloudflare dashboard)
- Lazy-upsert ordering fix for Clerk/Stripe orphan prevention (separate spec)
- Generalized `BaseService` pattern (only meaningful once 3+ services share concrete structure)

## Architectural choices (with rationale)

### Module-level functions, not classes

`stripe_service.py` is module-level functions and works well. Two services don't justify polymorphism. Mocking happens at the SDK layer (`anthropic.AsyncAnthropic`, `aioboto3.Session`), not at the service layer. FastAPI's `Depends()` isn't needed for stateless modules.

### Real wire-up, not stubs

The phrase "service layer stubs only" in `CLAUDE.md` §5 is interpreted as **real SDK integration with no feature-code callers yet**, not pure interface stubs. Reasons:
- The abstraction is only as good as its actual SDK integration. Ship-time discovery of auth or shape mismatches blocks downstream work.
- A real smoke test ("ping → pong" against Haiku, costs ≈ $0.0001) proves the wiring end-to-end before any feature spec depends on it.
- Refactoring real code is faster and safer than retrofitting real code onto a stub.

### Cloudflare R2 over AWS S3

Both are S3-compatible and use `boto3`/`aioboto3`. R2 has zero egress fees, which matters for an edtech where parents and teachers may download student work or PDFs frequently. AWS S3 remains a viable fallback — same SDK, just different endpoint URL.

### `CallContext` over loose kwargs

Every external service call needs `organization_id`, `user_id`, `request_type`, plus the data-minimization flag. Bundling them once at the route handler avoids 4-5 mandatory kwargs on every service function and gives us one shape to extend (e.g., when we add request_id or trace_id later).

### Shared `_logging.py` helper

Three callers will write `audit_log` rows (Stripe, Claude, R2). Centralizing the writes:
- **DRY** — one place to add fields, e.g., a request_id, a Sentry breadcrumb, a metric tag
- **Compliance** — a single audit gate is much easier to defend in privacy reviews than scattered audit code. SDPC NDPA / Common Sense Privacy / Student Privacy Pledge all want a clear answer to "where does your code log access to student data?"
- **Type-level enforcement** — the helper requires `organization_id` and `action`, preventing future bugs that log incomplete entries

Migration of `stripe_service.py` is surgical: two existing `_write_audit_log` call sites swap to `from ._logging import write_audit_log`. No behavior change, no other refactoring.

## Components

### `services/call_context.py`

```python
from dataclasses import dataclass
from uuid import UUID

@dataclass(frozen=True)
class CallContext:
    organization_id: UUID
    user_id: UUID | None             # None for system-initiated calls
    request_type: str                # e.g. "diagnostic_classify", "assessment_upload"
    contains_pii: bool               # explicit acknowledgment per CLAUDE.md §3
    audit_reason: str | None = None  # required when contains_pii=True

    def __post_init__(self) -> None:
        if self.contains_pii and not self.audit_reason:
            raise ValueError("audit_reason is required when contains_pii=True")
```

Frozen so a service cannot mutate it mid-call. Construction-time validation fails fast at the call site, not deep inside the service.

### `services/claude_service.py`

Two public functions consumed by the diagnostic-engine spec later:

```python
async def call_text(
    *,
    ctx: CallContext,
    model: str,                      # "claude-sonnet-4-6" or "claude-haiku-4-5-20251001"
    system: str,
    messages: list[dict],
    max_tokens: int,
    db: AsyncSession,
) -> ClaudeTextResponse: ...

async def call_vision(
    *,
    ctx: CallContext,
    model: str,
    system: str,
    image: bytes | str,              # bytes for direct, str for image URL
    prompt: str,
    max_tokens: int,
    db: AsyncSession,
) -> ClaudeVisionResponse: ...
```

Both write an `LLMCallLog` row on every call (success or failure). Cost is computed from token counts using a small price table (Sonnet 4.6 + Haiku 4.5 rates). Wraps `anthropic.AsyncAnthropic`.

Two functions instead of one because the parameter shapes diverge enough (vision takes `image`, text takes `messages`) that a unified signature would be a mess of `Optional[]` fields.

### `services/storage_service.py`

Three public functions consumed by the assessment-upload spec later:

```python
async def get_upload_url(
    *,
    ctx: CallContext,
    key: str,
    content_type: str,
    expires_in: int = 600,
    db: AsyncSession,
) -> str: ...                        # presigned PUT URL

async def get_download_url(
    *,
    ctx: CallContext,
    key: str,
    expires_in: int = 600,
    db: AsyncSession,
) -> str: ...                        # presigned GET URL

async def delete_object(
    *,
    ctx: CallContext,
    key: str,
    db: AsyncSession,
) -> None: ...
```

Presigned URLs let the browser upload directly to R2 — no proxy through FastAPI, no large bodies in the API. Each call writes an `audit_log` entry. Wraps `aioboto3` against the R2 endpoint URL (`https://<account>.r2.cloudflarestorage.com`).

### `services/_logging.py`

```python
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
) -> None: ...

async def write_audit_log(
    db: AsyncSession,
    *,
    ctx: CallContext,
    resource_type: str,
    resource_id: UUID | None,
    action: str,
    extra: dict[str, Any] | None = None,
) -> None: ...
```

Single place that constructs `LLMCallLog` and `AuditLog` rows. Stripe service migrates to `write_audit_log` for its existing `stripe_customer_created` and `stripe_checkout_session_started` actions.

## Data flow

### Typical Claude call (diagnostic classification, future)

```
Route handler
  ├── construct CallContext(org_id, user_id, request_type="diagnostic_classify",
  │                          contains_pii=True, audit_reason="grade student work")
  └── await claude_service.call_vision(ctx=ctx, model=..., image=..., prompt=..., db=db)
        ├── start = time.monotonic()
        ├── try:
        │     response = await anthropic_client.messages.create(...)
        │     latency_ms = ...
        │     await write_llm_call_log(db, ctx=ctx, model=...,
        │                               tokens_input=..., tokens_output=...,
        │                               cost_usd=compute_cost(...),
        │                               latency_ms=..., success=True)
        │     return response
        ├── except anthropic.APIError as exc:
        │     await write_llm_call_log(db, ctx=ctx, ..., success=False,
        │                               error_message=str(exc))
        │     raise
```

`llm_call_log` is written even on failure — so cost/latency dashboards reflect all attempts and we can see error rates by model. The DB write happens in the caller's session/transaction; if the caller rolls back, the log row goes too.

### Typical R2 upload (future assessment upload)

```
Browser                   Route handler              storage_service           R2
  │   POST /assessments      │                            │                      │
  ├─────────────────────────>│                            │                      │
  │                          │  get_upload_url(ctx,       │                      │
  │                          │                  key, ...) │                      │
  │                          ├───────────────────────────>│                      │
  │                          │                            │ generate_presigned   │
  │                          │                            │  (boto3)             │
  │                          │                            ├─────────────────────>│
  │                          │                            │<──────signed URL─────┤
  │                          │                            │ write_audit_log      │
  │                          │                            │  action=             │
  │                          │                            │  "presigned_upload   │
  │                          │                            │   _issued"           │
  │                          │<───────────signed URL──────┤                      │
  │<─────signed URL──────────┤                            │                      │
  │                                                                              │
  │   PUT signed URL with image bytes (no FastAPI in path)                       │
  ├─────────────────────────────────────────────────────────────────────────────>│
```

The `audit_log` entry is written when we ISSUE the upload URL, not when the upload happens (R2 doesn't notify us back). The `key` is derived from `assessment_id` + content_hash, never from a student name — that is the data-minimization rule in practice for filenames.

## Error handling

### Claude

| Error class | Action |
|---|---|
| `anthropic.APIConnectionError` (network) | Retry up to 3x with exponential backoff (1s, 2s, 4s); log all attempts |
| `anthropic.RateLimitError` (429) | Retry up to 2x respecting `Retry-After` header; log all attempts |
| `anthropic.APITimeoutError` | Same as connection error |
| `anthropic.BadRequestError` (4xx other) | Fail immediately, log, raise to caller |
| `anthropic.AuthenticationError` (401) | Fail immediately, log, raise — indicates env config bug |
| Any other exception | Fail, log with `success=False, error_message=...`, raise |

The retry loop is inside `call_text` / `call_vision`. Each retry attempt writes its own `llm_call_log` row (so cost/latency are per-attempt, not per-call) — easier to spot retry storms. A small in-module helper `_with_retries(...)` keeps the retry logic in one place.

### R2

| Error class | Action |
|---|---|
| `botocore.exceptions.ClientError` with `ThrottlingException` | Retry up to 2x with backoff |
| Any 5xx from R2 | Retry up to 2x |
| 4xx (bad credentials, missing bucket, malformed key) | Fail, raise — indicates config bug |
| Network error | Retry up to 3x |

Presigned URL generation is purely cryptographic (no R2 API call), so it cannot fail in transit. Only the `audit_log` write can fail — we log the failure but don't crash the route.

### Caller's perspective

Both services raise typed exceptions:

```python
class ClaudeServiceError(Exception): ...
class StorageServiceError(Exception): ...
```

Callers can catch them or let them bubble to FastAPI's error handler. The frontend `error.tsx` (added in the editorial-theme retrofit) handles the resulting 500.

## Testing

### Smoke tests (`tests/services/test_claude_smoke.py`, `test_storage_smoke.py`)

- **Claude**: real call to Anthropic with the cheapest available message ("ping" → "pong" with `max_tokens=10`, Haiku model — costs ≈ $0.0001 per run). Verifies SDK auth, that we can construct CallContext, that an `llm_call_log` row gets written.
- **R2**: real round-trip — presigned PUT → upload 1KB → presigned GET → download → assert match → delete. Verifies SDK auth, presigned URL generation, that an `audit_log` row gets written.

Marked `@pytest.mark.integration` so they only run when `INTEGRATION=1` is set. Default `pytest` run skips them. CI controls cost by opting in selectively (e.g., on PRs that touch `services/`).

### Unit tests

- `tests/services/test_call_context.py` — validation + frozen behavior
- `tests/services/test_logging.py` — both helpers construct correct rows; reject empty `action`
- `tests/services/test_claude_service.py` — mocked `anthropic.AsyncAnthropic`; verify call wiring, retry behavior, log writes on success and failure
- `tests/services/test_storage_service.py` — mocked `aioboto3.Session`; verify presigned URL generation, audit writes, retry behavior

### What we do not test (deferred)

- Diagnostic engine prompt content (does not exist yet)
- R2 lifecycle policies (managed in dashboard)
- Frontend response-shape contracts (no callers yet)

## Configuration

New env vars (`apps/api/.env` for local dev; Railway for prod):

```
ANTHROPIC_API_KEY=sk-ant-api03-...
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 token access key>
R2_SECRET_ACCESS_KEY=<r2 token secret>
R2_BUCKET=grade-sight-assessments
R2_ENDPOINT_URL=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Day-0 setup tasks (no code, dashboard work):
1. Create R2 bucket `grade-sight-assessments`
2. Create R2 API token with read/write scope on that bucket
3. Verify Anthropic API key is valid (it should already be — for prior testing)

## New dependencies

- `anthropic` (Python SDK; AsyncAnthropic client)
- `aioboto3` (async wrapper around `boto3` for asyncio compatibility)

Both go into `apps/api/pyproject.toml` and resolve via `uv sync`.

## Open questions / decisions to confirm during implementation

- **Cost table format**: hardcoded dict in `claude_service.py` vs. config file. Hardcoded is fine for two models; revisit if we add more.
- **`request_type` taxonomy**: free-form string for now; the diagnostic engine spec will define the canonical values it uses. Don't over-engineer here.

## Out of this spec, queued for later

- **Lazy-upsert ordering fix** — DB writes before external calls in `auth/dependencies.py` to prevent Clerk/Stripe orphan resources on partial failure. Surfaced during Spec 4 acceptance. Standalone spec when ready.
- **`BaseService` pattern** — defer until 3+ services share concrete shared structure. Two services do not.
- **Sentry instrumentation** — separate observability spec. The `_logging.py` helper is the right place to add Sentry breadcrumbs when that spec runs.
