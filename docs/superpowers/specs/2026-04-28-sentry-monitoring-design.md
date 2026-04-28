# Sentry Monitoring Design (Spec 13)

> **Status:** Approved (2026-04-28).
> **Phase:** Phase 1 MVP — observability infrastructure.

## Goal

Wire up Sentry error tracking and light performance tracing on both the FastAPI backend and the Next.js frontend, with PII scrubbing that satisfies CLAUDE.md §4 commitments. After this spec ships, every unhandled exception in production lands in a single dashboard with stack traces, pseudonymous user/org context, and a Railway commit SHA — and zero student PII.

This is pure infrastructure. No user-facing UX changes, no new product surfaces.

## Scope

**In scope:**
- Backend: `sentry-sdk[fastapi]` integration, FastAPI auto-instrumentation, AsyncPG/SQLAlchemy spans
- Frontend: `@sentry/nextjs` integration, server + client init via Next.js 16 instrumentation files, source-map upload at build
- A single PII scrubber module on each side, applied via `before_send` / `beforeSend`
- Pseudonymous user context: `user.id` (our internal `User` UUID) + `organization_id` tag — never name/email/student data
- Initialization gate: SDK is a no-op unless `ENVIRONMENT=production` AND DSN env var is set
- 10% transaction sampling for performance traces (`traces_sample_rate=0.1`)
- Tests for the scrubber and init-gate behavior; manual Railway smoke documented in the plan
- CLAUDE.md updates (privacy commitment line, scope gate for Session Replay, current-phase tick on completion)

**Out of scope (deferred):**
- Custom LLM cost spans inside `claude_service` (would let you see token cost per page in Sentry traces; `llm_call_logs` table already covers this for now)
- Alert rules, Slack/email notifications (configured in Sentry UI, not in code)
- Sentry Session Replay (privacy risk requires explicit review — added to CLAUDE.md §5 scope gates)
- Profiling integration (CPU/memory profiles per transaction)
- Public privacy policy / subprocessor list copy (edtech-counsel territory per CLAUDE.md §4 — flagged as TODO)

## Architectural choices (with rationale)

### One Sentry project, two services tagged

Sentry's recommended pattern is one project per logical product, with `service=api` and `service=web` tags separating the two SDK integrations. Two projects would split the dashboard for what is conceptually one outage when both halves are affected. Same DSN per environment is fine — environment is a tag, not a project.

### `before_send` over Sentry's built-in PII detection

Sentry has a `send_default_pii=False` master switch and some auto-scrubbing of sensitive headers. Both useful, both insufficient. Our PII shapes (`student_name`, `original_filename` like "Lily_Algebra2_Quiz.pdf", base64 image bytes in Anthropic call frames, presigned R2 URLs) are project-specific and need our own deny-list. We use `send_default_pii=False` as belt + suspenders, but the load-bearing privacy gate is our `before_send` hook.

### Initialization gate, not feature flag

Two booleans determine whether the SDK initializes: `ENVIRONMENT == "production"` AND `SENTRY_DSN` is set. If either fails, `sentry_sdk.init(...)` is never called — no transport, no breadcrumbs, no events. This avoids "Sentry init succeeded but nothing's being sent because key X is missing" debugging confusion, and keeps developer laptops completely silent.

### Pseudonymous user context, not anonymous

Anonymous would be safer privacy-wise but makes "this error affects users X, Y, Z" triage impossible. Pseudonymous (internal UUIDs only — no email, no name) gives the triage value without sharing directly-identifying fields. Our `User.id` is a UUID we own; the Clerk-side mapping to email lives in our DB and never reaches Sentry. `organization_id` joins as a tag for tenant-scoped triage.

**Students are never users.** Sentry only ever gets context about the *operator* (parent or teacher) who hit the error. Student rows are data subjects, not actors — they don't identify themselves to Sentry under any circumstance.

### Errors + 10% transaction sampling

Errors-only would be cheaper, but the marginal cost of `traces_sample_rate=0.1` is small and surfaces useful "slow request" patterns. Custom LLM-cost spans are deferred — `llm_call_logs` table already has cost+latency for Claude calls, so duplicating that in Sentry now is YAGNI. Promote LLM spans to a future spec if/when there's an actual debugging need Sentry could solve that the DB table can't.

### Production-only initialization

Local dev errors go to the terminal as they always have. Staging is provisioning-ahead-of-need (we don't have a staging environment yet); when we add one, flipping it on is a one-line change to the gate.

### File layout: scrubber as a single-purpose module

```
apps/api/src/grade_sight_api/services/sentry_init.py    # gate + init call
apps/api/src/grade_sight_api/services/sentry_scrubber.py # before_send hook
apps/web/lib/sentry-scrubber.ts                          # frontend before_send
apps/web/instrumentation.ts                              # Next.js server-side init
apps/web/instrumentation-client.ts                       # Next.js client-side init
```

Each scrubber module is one function with one job, fully unit-testable on synthetic Sentry events. They don't import anything from feature code, so they can't accidentally pull in PII through transitive imports.

## Configuration

### New environment variables

| Var | Side | Required when | Example | Notes |
|---|---|---|---|---|
| `SENTRY_DSN` | backend | `ENVIRONMENT=production` | `https://abc@o12345.ingest.us.sentry.io/678` | Reserved in `.env.example` line 19; uncomment with prod-only note |
| `NEXT_PUBLIC_SENTRY_DSN` | frontend | `ENVIRONMENT=production` | same as above | Browser-safe by Sentry's design (write-only ingestion endpoint) |
| `SENTRY_AUTH_TOKEN` | frontend build-time | source map upload | `sntrys_…` | **Secret** — Railway/CI only, never committed |
| `SENTRY_ORG` | frontend build-time | source map upload | `grade-sight` | Hardcoded fallback in `next.config.ts` |
| `SENTRY_PROJECT` | frontend build-time | source map upload | `grade-sight-web` | Hardcoded fallback in `next.config.ts` |

`apps/api/.env.example` already reserves `# SENTRY_DSN=`. We update the comment to note prod-only behavior.

`apps/web/env.ts` (the `@t3-oss/env-nextjs` schema) gets `NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional()`.

### SDK init parameters (backend)

```python
sentry_sdk.init(
    dsn=settings.sentry_dsn,
    environment=settings.environment,
    release=os.environ.get("RAILWAY_GIT_COMMIT_SHA"),
    traces_sample_rate=0.1,
    send_default_pii=False,
    before_send=scrub_event,
    integrations=[FastApiIntegration(), AsyncPGIntegration()],
)
```

`RAILWAY_GIT_COMMIT_SHA` is set automatically by Railway at runtime — no manual versioning required.

### SDK init parameters (frontend)

Mirror of the backend with the same `beforeSend` shape and 0.1 sample rate. Source-map upload is configured via `withSentryConfig(nextConfig, {...})` wrapping `next.config.ts` — the `@sentry/nextjs` wizard generates the boilerplate.

## PII scrubbing strategy

Single function on each side. Same shape, different language. Applied to every event before it leaves our process.

### Scrub list (deny-list)

| Field path | Why |
|---|---|
| `request.headers` | Cookies, auth tokens, Clerk session data |
| `request.cookies` | Session cookies |
| `request.data` (POST/PUT bodies) | Often contains `student_name`, `original_filename`, answer-key page bytes, `consent_flags` |
| `request.query_string` | Query params can include UUIDs we'd rather scope to user context only |
| `extra.image_bytes`, `extra.images`, any `extra` containing base64 image content | Student work — never leaves our infra |
| Email-shaped strings in `logentry.formatted`, `logentry.message`, and `exception.values[].value` | Clerk emails leaking through log lines or `raise SomeError("...email...")` stringification |
| Strings matching `https://*.r2.cloudflarestorage.com/*` in the same fields above | Presigned R2 URLs reveal R2 keys + grant temporary read access |
| Frame `vars` for `image`, `images`, `prompt`, `system` in `claude_service.py` frames | Anthropic call payloads |
| `event.user.email`, `event.user.username`, `event.user.ip_address` | Whitelist allows only `user.id` + `organization_id` tag |

### Keep list (intentionally preserved)

- Stack trace + non-PII frame variables (`assessment_id`, `page_number`, error category strings, HTTP status, model name)
- Tags: `environment`, `release`, `service` (api/web), `route`
- Pseudonymous `user.id` UUID + `organization_id` UUID tag
- Breadcrumbs for DB / outbound HTTP calls *with URL paths only, not bodies*

### Failure mode of the scrubber itself

If `before_send` raises, Sentry's SDK drops the event. That's the safe fallback — better to lose an error than leak PII. Tests cover the malformed-event case.

### No "send PII" override flag

The existing `CallContext.contains_pii` flag in `services/call_context.py` is a *log-this-action-to-audit-log* signal, not a *send-this-data-to-third-parties* signal. Sentry's job is errors, not audit. We never pass through PII to Sentry under any flag. If we ever need to debug a PII-touching call, we look at the `audit_log` table (which holds the action breadcrumb), not Sentry.

## Data flow

### Backend init

```
main.py imports → setup_sentry() → checks ENVIRONMENT + SENTRY_DSN
   ↓ (both present)                        ↓ (either missing)
sentry_sdk.init(...)                       no-op (return early)
   ↓
FastAPI app construction → middleware auto-captures unhandled exceptions
   ↓
get_current_user dependency → sentry_sdk.set_user({"id": str(user.id)})
                              sentry_sdk.set_tag("organization_id", str(user.organization_id))
                              (per-request scope — Sentry hub model)
```

### Frontend init (Next.js 16)

```
instrumentation.ts (server runtime)        → setupSentryNode()
instrumentation-client.ts (browser)        → setupSentryClient()
                                             both share lib/sentry-scrubber.ts
```

User context attachment uses `/api/me` (already called in every authenticated page via `fetchMe()`), which returns our internal `User.id` UUID and nested `organization.id` UUID. `AppShell` (the server component that wraps every authenticated page) gets two new props — `userId: string` and `organizationId: string | null` — and renders a small client component `<SentryUserSync userId={...} organizationId={...} />`. The client component calls `Sentry.setUser({ id: userId })` and `Sentry.setTag("organization_id", organizationId)` inside a `useEffect`. SSR doesn't run the effect, so no hydration leak; the call is idempotent across re-renders. Each page that already calls `fetchMe()` (`app/dashboard`, `app/upload`, `app/students`, `app/paywall`, `app/settings/billing`, `app/assessments/[id]`) passes the two new props alongside the existing `orgName`.

## Error handling — what we capture vs ignore

**Captured by default (no extra wiring needed):**
- Unhandled exceptions in FastAPI route handlers → 5xx
- `ClaudeServiceError` (already exhausted retries before raising)
- R2/storage exceptions during presigned-URL generation or completions
- Stripe webhook handler exceptions (billing-state divergence is high-stakes)
- Server action exceptions (`@sentry/nextjs` v9+ wraps these automatically)
- Frontend uncaught render errors via `app/error.tsx` (we add `Sentry.captureException(error)` to the existing handler)

**Explicitly ignored:**
- 4xx HTTPExceptions (Pydantic 422, validation 400, auth 401/403) — user input mistakes, not bugs. Sentry's default behavior already filters these.
- Soft retries inside `_with_retries` — only the terminal raise lands in Sentry, not each retry attempt.

**Engine parse failures already covered by default capture:** `engine_service.diagnose_assessment` already raises `EngineParseError` on Claude JSON shape mismatches — the route handler propagates it and FastAPI auto-instrumentation captures it. No extra `capture_message` is needed.

## Privacy & compliance updates

This spec touches CLAUDE.md and the (eventual) public privacy/subprocessor list.

### CLAUDE.md changes (in this spec)

1. **§4 hard commitments** — add one line:
   > *"We share pseudonymous diagnostic data (internal user and organization UUIDs only — no names, emails, or student work) with our error-tracking subprocessor solely to keep the platform reliable and secure."*

   Final wording can be polished by counsel later; this captures the substance.

2. **§5 "Do NOT yet" scope gate** — add:
   > *"Do not enable Sentry Session Replay — privacy risk requires explicit review."*

3. **§1 current phase** tick to "Spec 13 (Sentry monitoring) complete" once implementation lands.

### Public-facing copy (deferred, flagged)

The public privacy policy and subprocessor list are counsel-reviewed deliverables (per CLAUDE.md §4). The plan includes a TODO note in `docs/PROJECT_BRIEF.md` marking that Sentry needs to be added to the published subprocessor list when it's drafted, with the diagnostic-data sharing language reviewed by edtech counsel.

## Testing

### Automated

| Test | File | Asserts |
|---|---|---|
| Scrubber strips request bodies, cookies, headers, R2 URLs, image bytes, emails | `apps/api/tests/services/test_sentry_scrubber.py` | Each PII shape removed; non-PII fields preserved |
| Scrubber returns `None` (drops event) when scrub raises on malformed event | same | Safe-fail behavior |
| `setup_sentry()` no-op when `SENTRY_DSN` unset | `apps/api/tests/services/test_sentry_init.py` | `sentry_sdk.init` not called |
| `setup_sentry()` no-op when `ENVIRONMENT != production` | same | Same |
| User context attached after auth, scoped per-request | `apps/api/tests/auth/test_dependencies.py` | `sentry_sdk.set_user` called with `{id: str(user.id)}`; `set_tag` called with `organization_id` |
| Frontend scrubber strips equivalent shapes | `apps/web/lib/__tests__/sentry-scrubber.test.ts` (vitest) | Mirror of backend tests |

### Manual smoke (documented in the plan, not automated)

- Set `ENVIRONMENT=production` + `SENTRY_DSN=…` on a Railway preview deploy
- Trigger a known-failing route (e.g., `/api/db-health` with a bad DATABASE_URL override)
- Confirm event lands in Sentry dashboard within 30 seconds
- Inspect: stack trace present, `user.id` UUID present, `organization_id` tag present, `release` matches deployed commit, request body absent, no email or filename strings anywhere in event
- Trigger frontend error (temporary `throw` in a server component), confirm event lands, source map deobfuscates to original TSX
- Tear down test trigger; confirm steady-state has zero events

## Files to be created / modified

**Backend (create):**
- `apps/api/src/grade_sight_api/services/sentry_init.py`
- `apps/api/src/grade_sight_api/services/sentry_scrubber.py`
- `apps/api/tests/services/test_sentry_init.py`
- `apps/api/tests/services/test_sentry_scrubber.py`

**Backend (modify):**
- `apps/api/pyproject.toml` (add `sentry-sdk[fastapi]>=2.0.0`)
- `apps/api/src/grade_sight_api/config.py` (add optional `sentry_dsn: str | None = None`)
- `apps/api/src/grade_sight_api/main.py` (call `setup_sentry()` before `app = FastAPI(...)`)
- `apps/api/src/grade_sight_api/auth/dependencies.py` (`set_user` + `set_tag` after `get_current_user` resolves)
- `apps/api/.env.example` (uncomment `SENTRY_DSN=`, add prod-only comment)
- `apps/api/tests/auth/test_dependencies.py` (extend with user-context assertion)

**Frontend (create):**
- `apps/web/instrumentation.ts`
- `apps/web/instrumentation-client.ts`
- `apps/web/lib/sentry-scrubber.ts`
- `apps/web/lib/__tests__/sentry-scrubber.test.ts`
- `apps/web/components/sentry-user-sync.tsx` (client component)

**Frontend (modify):**
- `apps/web/package.json` (add `@sentry/nextjs`)
- `apps/web/next.config.ts` (wrap with `withSentryConfig` for source-map upload)
- `apps/web/env.ts` (add `NEXT_PUBLIC_SENTRY_DSN` optional)
- `apps/web/app/error.tsx` (call `Sentry.captureException(error)` inside existing `useEffect`)
- `apps/web/components/app-shell.tsx` (accept `userId` + `organizationId` props, render `SentryUserSync`)
- Six page files that call `fetchMe()` (`app/dashboard/page.tsx`, `app/upload/page.tsx`, `app/students/page.tsx`, `app/paywall/page.tsx`, `app/settings/billing/page.tsx`, `app/assessments/[id]/page.tsx`) — pass `userId` + `organizationId` to `AppShell`

**Docs:**
- `CLAUDE.md` (§4 privacy line, §5 scope gate, §1 phase tick on completion)
- `docs/PROJECT_BRIEF.md` (TODO marker for subprocessor-list update on counsel review)

## Acceptance criteria

- All automated tests pass
- Manual Railway smoke produces a captured event with the expected shape (user UUID present, no PII)
- A locally-triggered exception while `ENVIRONMENT=development` produces no Sentry event (silent gate)
- Frontend stack trace in Sentry dashboard shows original TSX, not minified bundle
- CLAUDE.md updates land in same PR as code
- Spec 12 smoke test (when run tomorrow) errors land in Sentry if any occur
