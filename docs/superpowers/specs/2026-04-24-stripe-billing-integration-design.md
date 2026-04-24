# Stripe Billing Integration Design — Grade-Sight

**Status:** Approved, ready for implementation planning
**Date:** 2026-04-24
**Author:** David (with Claude Code)
**Scope:** Spec 4 of 5 (revised from the original 4-spec decomposition). This spec was inserted after Spec 3 based on the user-authored requirements document at `docs/STRIPE_INTEGRATION_SPEC.md`. The generic external-service-abstraction spec (originally Spec 4) is now Spec 5 and will use the patterns established here as its reference implementation.

## Problem

Grade-Sight needs a subscription billing layer from MVP, not added later. Every user entering the product should begin an entitlement-gated journey: 30-day no-card free trial → prompt to add card → paid subscription. The surrounding architecture's privacy-first and service-layer non-negotiables (multi-tenancy via `organization_id`, soft delete, external service abstraction, audit log) apply here with no exceptions. This spec pins down the state machine, schema, endpoints, webhooks, and frontend components that turn STRIPE_INTEGRATION_SPEC.md's requirements into something an implementer can ship.

## Goals

- Every new Clerk-authenticated user gets a `subscriptions` row with `status=trialing` on their first authenticated request.
- Subscriptions hang off `organization_id`, not `user_id`. Parents get their own solo org (named `"{First Last}'s Family"`); teachers keep the existing `"{First Last}'s Classroom"` pattern. Both audiences treated symmetrically.
- Trial state machine runs locally (no Stripe subscription exists) until the user adds a card via Stripe hosted Checkout. After card add, Stripe owns the state machine and we track via webhooks.
- Entitlement checks are fast — a denormalized `organizations.subscription_status` column; no Stripe API call on the hot path.
- Webhook handler is idempotent, signature-verified, and writes audit log entries for every state transition.
- All Stripe API calls go through `services/stripe_service.py` — zero scattered `stripe.X.create()` calls anywhere else.
- Local dev works against Stripe test-mode keys + Stripe CLI for webhook forwarding. Production uses live keys.

## Non-Goals

- **Email reminders** (T-7, T-3, T-1) — deferred to a dedicated email/Resend spec. Foundation is explicitly laid (see below).
- **Annual plans, promo codes, coupons, proration beyond Stripe defaults, multi-seat teacher plans, school-district tier, usage-based billing** — per STRIPE_INTEGRATION_SPEC.md's explicit Do-NOT-yet list.
- **Embedded Stripe Elements card collection** — hosted Checkout only.
- **Custom invoice PDFs** — Stripe's defaults.
- **Dunning email sequences** — rely on Stripe's built-in retry emails for failed payments.
- **Admin endpoint** exposing `reconcile_subscription()` — the function exists; no route surface yet.
- **Entitlement gating of feature endpoints** — `has_active_subscription()` is built and ready; actual gating comes as features are built in Specs 5+.
- **Parent-org data migration for existing users** — we wiped the test DB (local + Railway) before starting this spec.
- **Stripe Tax** — can enable later via dashboard without code changes.
- **Tests authored** — scaffolding only, per the kickoff constraint.

## Decisions Locked in Brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Parent org model | Each parent gets a solo auto-created org named `"{First Last}'s Family"` |
| 2 | User/Stripe sync strategy | Extend Spec 3's lazy upsert — on new user: create Clerk org + Stripe customer + trial subscription row in the same transaction |
| 3 | Parent Clerk org | Yes — create a Clerk org for parents too, mirroring teacher pattern; keeps code paths uniform |
| 4 | Roadmap reshuffle | Spec 4 is now Stripe; the original external-service-abstraction spec (Claude/S3/audit_log wiring generalized) becomes Spec 5 |
| 5 | Email reminders scope | Deferred to a future spec; foundation laid (webhook event handled as no-op, `trial_ends_at` indexed, audit log entries per transition) |

## Foundation for Deferred Email Reminders

When the email spec lands later, these four things from Spec 4 make it cheap to implement:

1. The `customer.subscription.trial_will_end` webhook IS dispatched — the handler just writes an `audit_log` entry `trial_ending_soon_signal_received`. Adding real sends becomes a one-line change: `await email_service.send_trial_ending_email(org)` inside the handler.
2. Every subscription state transition writes an `audit_log` entry. The email spec queries `audit_log` to avoid double-sending.
3. `subscriptions.trial_ends_at` is **indexed** — supports the future query `WHERE trial_ends_at BETWEEN now() AND now() + interval '7 days' AND status = 'trialing'`.
4. The service-layer pattern (`services/stripe_service.py`) is a direct template for `services/email_service.py`.

## Architecture

### Identity layers (extending Spec 3)

- **Clerk** — authentication, session management, **and** organizations. Both parent and teacher users now have Clerk orgs.
- **Our DB** — user + organization business data + NEW `subscriptions` + `subscription_events` tables + NEW `organizations.subscription_status` denormalized column.
- **Stripe** — billing identity (customers), subscription lifecycle once a card exists, Customer Portal (self-service), Checkout (hosted card collection).

### Entitlement source of truth

- **Read path:** `organizations.subscription_status` denormalized column. No Stripe call, no join. Used by every entitlement check on every gated request.
- **Write path:** Stripe webhooks → our handlers → update `subscriptions.status` + denormalize to `organizations.subscription_status`.
- **Drift repair:** `reconcile_subscription(org_id)` pulls fresh state from Stripe and overwrites our rows. Not wired to a cron in Phase 1; exists for manual use.

### Lazy upsert path (extended from Spec 3)

Spec 3's `get_current_user` new-user branch handled Clerk org creation for teachers only. Spec 4 extends it:

```
1. Verify JWT → extract clerk_user_id.
2. SELECT users WHERE clerk_id = ... → if found, drift-update email/name, return.
3. New user:
   a. Fetch Clerk user via SDK.
   b. role = _normalize_role(unsafe_metadata.role).
   c. org_name = f"{first} {last}'s Classroom" (teacher) or "{first} {last}'s Family" (parent).
      Fallback to email-local-part-based name if names empty.
   d. Create Clerk org → clerk_client.organizations.create(...).
   e. INSERT organizations row with clerk_org_id.
   f. plan = Plan.teacher_monthly if role == teacher else Plan.parent_monthly.
   g. Create Stripe customer → stripe_service.create_customer(email, org_id).
   h. INSERT subscriptions row (status=trialing, trial_ends_at=now+30d, stripe_customer_id, stripe_subscription_id=NULL).
   i. UPDATE organizations.subscription_status = trialing (denormalize).
   j. INSERT users row with organization_id.
   k. Write audit_log: action=subscription_trial_created.
   l. Return new user.
```

Wrap steps d–k in a savepoint-scoped DB transaction so DB consistency is preserved on failure. Clerk and Stripe side effects on failure fall to dangling-orphan reconciliation (acceptable at Phase 1 scale).

### Directory layout additions

```
apps/api/src/grade_sight_api/
├── services/
│   ├── __init__.py                 # existing (was empty)
│   ├── stripe_service.py           # NEW
│   └── entitlements.py             # NEW
├── routers/
│   ├── me.py                       # existing
│   ├── billing.py                  # NEW: /api/me/entitlement, /api/billing/checkout, /api/billing/portal
│   └── webhooks/
│       ├── __init__.py             # NEW
│       └── stripe.py               # NEW: POST /api/webhooks/stripe
├── models/
│   ├── organization.py             # UPDATED: add subscription_status
│   ├── subscription.py             # NEW
│   └── subscription_event.py       # NEW
├── schemas/
│   ├── me.py                       # existing
│   └── billing.py                  # NEW: EntitlementResponse, CheckoutSessionResponse, PortalSessionResponse
├── auth/
│   └── dependencies.py             # UPDATED: extended lazy upsert
├── config.py                       # UPDATED: STRIPE_* env vars
└── main.py                         # UPDATED: include billing + webhook routers

apps/web/
├── app/
│   ├── dashboard/page.tsx          # UPDATED: render TrialBanner when trialing + ≤7d
│   ├── settings/billing/page.tsx   # NEW
│   └── paywall/page.tsx            # NEW
├── components/
│   ├── TrialBanner.tsx             # NEW
│   └── Paywall.tsx                 # NEW (inline variant for embed)
└── lib/
    └── api.ts                      # UPDATED: fetchEntitlement, createCheckoutSession, createPortalSession
```

## Schema

### New table: `subscriptions`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default `uuid4` |
| `organization_id` | UUID | NOT NULL, **UNIQUE**, FK `organizations.id` ON DELETE RESTRICT |
| `stripe_customer_id` | TEXT | NOT NULL, indexed |
| `stripe_subscription_id` | TEXT | NULL (populated once card added); partial unique WHERE NOT NULL |
| `plan` | ENUM `plan` | NOT NULL — values `parent_monthly`, `teacher_monthly` |
| `status` | ENUM `subscription_status` | NOT NULL — values `trialing`, `active`, `past_due`, `canceled`, `incomplete` |
| `trial_ends_at` | TIMESTAMPTZ | NULL, **indexed** |
| `current_period_end` | TIMESTAMPTZ | NULL |
| `cancel_at_period_end` | BOOLEAN | NOT NULL default `false` |
| `created_at`, `updated_at`, `deleted_at` | standard | via `TimestampMixin` + `SoftDeleteMixin` |

Indexes: unique `organization_id`, `stripe_customer_id`, partial unique `stripe_subscription_id WHERE NOT NULL`, `trial_ends_at`, `status`.

### New table: `subscription_events` (append-only)

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `stripe_event_id` | TEXT | NOT NULL, **UNIQUE** |
| `event_type` | TEXT | NOT NULL |
| `subscription_id` | UUID | NULL, FK `subscriptions.id` ON DELETE RESTRICT |
| `payload` | JSONB | NOT NULL (full webhook body) |
| `processed_at` | TIMESTAMPTZ | NULL (populated once handler succeeds) |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` |

No `updated_at`, no `deleted_at`. Indexes: unique `stripe_event_id`, `event_type`, `subscription_id`, `created_at`, `processed_at`.

### Updated table: `organizations`

Add one column:

| Column | Type | Constraints |
|---|---|---|
| `subscription_status` | ENUM `subscription_status` | NULL (pre-subscription rows have NULL; webhook handler denormalizes from `subscriptions.status`) |

### Enums

Two new Postgres enum types, both mapped to `enum.StrEnum` Python classes:

- `plan`: `parent_monthly`, `teacher_monthly`
- `subscription_status`: `trialing`, `active`, `past_due`, `canceled`, `incomplete`

### Migration

Single new Alembic migration `0003_add_stripe_billing.py` covering all of the above. Reversible: `downgrade()` drops tables + column + types in correct order.

Pre-existing Spec 3 migration count: 2 (`b9189088c385_initial_schema`, `f7ad39986104_add_clerk_org_id_to_organizations`). This is #3.

## Service Layer

### `services/stripe_service.py`

Single module wrapping all Stripe API calls. Nothing else in the codebase imports `stripe` directly. Module-level instantiation of the Stripe client using `settings.stripe_secret_key`.

Public functions:

```python
async def create_customer(
    email: str,
    org_id: UUID,
    db: AsyncSession,
) -> stripe.Customer:
    """Create Stripe customer, log, audit, return."""

async def create_checkout_session(
    org_id: UUID,
    plan: Plan,
    db: AsyncSession,
) -> stripe.checkout.Session:
    """Hosted Checkout session URL for adding a card to the trial."""

async def create_customer_portal_session(
    org_id: UUID,
    db: AsyncSession,
) -> stripe.billing_portal.Session:
    """Self-service portal URL."""

def verify_webhook_signature(
    payload: bytes,
    signature: str,
) -> stripe.Event:
    """Raise on invalid signature; return parsed event otherwise."""
```

Each function logs to Python `logging` (INFO) with a request correlation id and timing. Each writes an `audit_log` entry for user-visible state changes (customer created, checkout session started, etc.). Raw API-call tracking (e.g., a `stripe_api_calls` table mirror of `llm_call_logs`) is deferred.

### `services/entitlements.py`

```python
_ENTITLED_STATUSES: frozenset[SubscriptionStatus] = frozenset({
    SubscriptionStatus.trialing,
    SubscriptionStatus.active,
    SubscriptionStatus.past_due,
})


async def has_active_subscription(org_id: UUID, db: AsyncSession) -> bool:
    """Fast entitlement read from denormalized organizations.subscription_status."""
    result = await db.execute(
        select(Organization.subscription_status).where(Organization.id == org_id)
    )
    status = result.scalar_one_or_none()
    return status in _ENTITLED_STATUSES


async def reconcile_subscription(
    org_id: UUID,
    db: AsyncSession,
) -> Subscription:
    """Pull fresh state from Stripe, update our rows. Drift repair."""
```

**`past_due` is entitled** — Stripe's smart-retries handle the dunning window; when they give up, Stripe moves status to `canceled` via webhook and we stop returning entitled. No explicit grace period tracking on our side.

## Endpoints

### Public (webhook)

**`POST /api/webhooks/stripe`** (no auth, signature-verified)

Flow:
1. Read raw body + `Stripe-Signature` header.
2. `verify_webhook_signature(payload, signature)` — 400 on failure.
3. SELECT `subscription_events` WHERE `stripe_event_id = event.id`. If found, return 200 (idempotency).
4. INSERT `subscription_events` row with `processed_at=NULL`.
5. Dispatch on `event.type`:
   | Event | Handler |
   |---|---|
   | `customer.subscription.created` | Link `stripe_subscription_id` to our row (matched by `stripe_customer_id`). Update `current_period_end`. Audit `subscription_linked`. |
   | `customer.subscription.updated` | Update `status`, `current_period_end`, `cancel_at_period_end`. Denormalize. Audit with action = current status. |
   | `customer.subscription.deleted` | Status → `canceled`. Denormalize. Audit `canceled`. |
   | `invoice.payment_succeeded` | Log + audit `payment_succeeded` with invoice metadata. |
   | `invoice.payment_failed` | Status → `past_due` (Stripe usually sends an updated event too; we handle both). Audit `payment_failed`. |
   | `customer.subscription.trial_will_end` | **No-op.** Audit `trial_ending_soon_signal_received`. (Future email spec hooks here.) |
   | (any other event type) | Log + return 200. |
6. UPDATE `subscription_events` SET `processed_at = now()` on success.
7. On handler exception: leave `processed_at` NULL, return 500 (Stripe will retry).

### Authenticated (Clerk session required)

**`GET /api/me/entitlement`** — returns `EntitlementResponse`:
```python
class EntitlementResponse(BaseModel):
    status: SubscriptionStatus | None
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    plan: Plan | None
    is_entitled: bool
```

**`POST /api/billing/checkout`** — creates a Stripe Checkout session scoped to the signed-in user's org + plan, returns `{"url": "<checkout-url>"}`. Frontend redirects to URL.

**`POST /api/billing/portal`** — creates a Customer Portal session, returns `{"url": "<portal-url>"}`. Frontend redirects.

### Unchanged from Spec 3

`/api/health`, `/api/db-health`, `/api/me` — no modification.

## Frontend

**`TrialBanner` component** — renders on `/dashboard` when `entitlement.status === 'trialing'` AND `trial_ends_at` is within 7 days. Shows "Trial ends in N days · Add card". CTA calls `POST /api/billing/checkout` → `window.location.assign(response.url)`.

**`/paywall` page** — landing destination when entitlement fails (future gated features will redirect here). Branches on state:
- `canceled` + `stripe_subscription_id IS NULL` → "Your trial has ended. Add a card to continue." → Checkout CTA.
- `canceled` + `stripe_subscription_id IS NOT NULL` → "Your subscription was canceled." → Customer Portal CTA.
- `past_due` (shouldn't hit paywall since past_due is entitled) → defensive "Payment issue detected, please update payment method." → Portal CTA.

**`/settings/billing` page** — server component; protected. Shows:
- Current plan (parent_monthly / teacher_monthly)
- Status (trialing / active / past_due / canceled)
- Trial end date or next billing date
- Button "Manage billing" → calls `POST /api/billing/portal` → redirect

**`/dashboard` update** — render `TrialBanner` above the existing "Logged in as…" block when applicable.

**`lib/api.ts` helpers** (server-side, attach Clerk token):
- `fetchEntitlement()` → `EntitlementResponse | null`
- `createCheckoutSession(plan?: Plan)` → `string` (URL)
- `createPortalSession()` → `string` (URL)

## Environment Variables

### New `apps/api` env vars

| Var | Required | Example | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` / `sk_live_...` | |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` | From Stripe Dashboard → Webhooks |
| `STRIPE_PRICE_PARENT_MONTHLY` | yes | `price_...` | Parent plan recurring price ID |
| `STRIPE_PRICE_TEACHER_MONTHLY` | yes | `price_...` | Teacher plan recurring price ID |

### New `apps/web` env vars

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | yes | `pk_test_...` / `pk_live_...` — currently unused (hosted Checkout only) but pre-wired for future Elements work |

Pydantic `Settings` extended to validate all new api vars. Missing/malformed triggers boot failure.

## Local Dev & Stripe Setup

### Stripe dashboard one-time setup (manual)

In Stripe Dashboard (test mode first):
1. Create two Products: `Parent Plan`, `Teacher Plan`.
2. Create recurring monthly prices: $15 for Parent, $25 for Teacher.
3. Record price IDs → `STRIPE_PRICE_PARENT_MONTHLY`, `STRIPE_PRICE_TEACHER_MONTHLY`.
4. Configure Customer Portal (what cancel behavior, whether invoices are visible, etc.). Stripe defaults are fine; tweak as desired.
5. Set up webhook endpoint (for production): URL `https://<api-service-url>/api/webhooks/stripe`, events from Section 4 table. Record signing secret → `STRIPE_WEBHOOK_SECRET`.

Mirror all of the above in live mode before Railway production deploy.

### Local webhook testing

```bash
stripe listen --forward-to localhost:8000/api/webhooks/stripe
```

This opens a tunnel and forwards events to local api. Stripe CLI prints a temporary webhook signing secret — use it as the local `STRIPE_WEBHOOK_SECRET` value.

Test cards (https://stripe.com/docs/testing):
- `4242 4242 4242 4242` → success
- `4000 0000 0000 9995` → insufficient funds
- `4000 0000 0000 0069` → charge succeeds, later disputes

### Developer flow (first time)

```bash
# 1. Ensure Clerk dev keys already set (from Spec 3)
# 2. Add Stripe test keys to apps/api/.env and apps/web/.env.local
# 3. Run stripe listen in a separate terminal (optional — only for webhook testing)
# 4. Normal dev flow:
docker compose up -d db
pnpm db:migrate
pnpm dev
```

## Testing (Scaffold only)

No assertions authored. `conftest.py` additions:
- `stripe_test_mode_fixture` — asserts `stripe.api_key` is set to a test-mode key; skips tests if missing.
- `subscription_factory` — stub returning a `trialing` state subscription row for a given org.

README updated with `stripe listen` instructions for future integration test development.

## Deployment Steps (Post-Implementation)

1. **Create Stripe products + prices** in Stripe dashboard (test mode). Record env values.
2. **Update local env files** (`apps/api/.env`, `apps/web/.env.local`) with Stripe test keys + price IDs.
3. **Verify local flow**: clean install, migrate, both sign-up paths create Stripe customers (check Stripe Dashboard → Customers).
4. **Apply the migration to Railway Postgres** via `pnpm db:migrate` against `DATABASE_PUBLIC_URL` (prefixed `+asyncpg`).
5. **Set Stripe env vars on Railway** for both api and web services (test keys for initial test; live keys once ready to ship).
6. **Create webhook endpoint in Stripe dashboard** pointing at the deployed api URL. Record signing secret, add to Railway api Variables.
7. **Trigger a redeploy** of both services (should auto-trigger from the push anyway).
8. **Verify deployed sign-up** creates a Stripe customer in the dashboard.
9. **Verify webhook receipt** by triggering `stripe trigger customer.subscription.created` — confirm `subscription_events` row lands in Railway DB.

## Acceptance Criteria

Implementation is done when all of these hold:

1. Local clean install + migrate produces schema with `subscriptions`, `subscription_events`, `organizations.subscription_status`, both new enums (`plan`, `subscription_status`).
2. Migration is reversible (`pnpm db:rollback` + `pnpm db:migrate` cycle works).
3. Parent sign-up end-to-end (local): lazy upsert creates Clerk org + our `organizations` row + Stripe customer + `subscriptions` row (`status=trialing`, `trial_ends_at` 30d out) + `users` row. Dashboard renders. Default org name is `"{First Last}'s Family"` or email-local-part fallback.
4. Teacher sign-up end-to-end: same as above with teacher plan + `"{First Last}'s Classroom"` org name.
5. `GET /api/me` returns the current user (Spec 3 — no regression).
6. `GET /api/me/entitlement` returns the trial state JSON with `is_entitled: true` during trial.
7. `POST /api/billing/checkout` returns a Stripe Checkout URL; visiting it loads Stripe's hosted card form.
8. Adding a test card via Checkout triggers `customer.subscription.created` → webhook updates `subscriptions.stripe_subscription_id` → `organizations.subscription_status` remains `trialing` (correct — Stripe doesn't transition to `active` until `trial_end` passes).
9. After `trial_ends_at` passes + first charge succeeds (simulated via `stripe trigger customer.subscription.updated`): our handler moves status to `active`, denormalization updates org.
10. `POST /api/billing/portal` returns a Customer Portal URL; cancelling via the portal fires `customer.subscription.updated` with `cancel_at_period_end=true` → our handler updates DB.
11. Webhook signature verification rejects unsigned/forged requests with 400.
12. Duplicate webhook delivery (same `stripe_event_id`) returns 200 without re-processing.
13. `pnpm typecheck / lint / build / test` all pass (no Spec 3 regressions).
14. `TrialBanner` renders on dashboard when `trial_ends_at` within 7 days.
15. `/paywall` page loads and branches on subscription state.
16. `/settings/billing` page loads with current plan + Portal button.
17. `README.md` updated with Stripe dashboard setup steps + Stripe CLI webhook testing instructions + test card numbers.
18. Deployed to Railway: env vars set on both services, migration applied to Railway Postgres, webhook endpoint registered in Stripe dashboard pointing at deployed api.

## Out of Scope / Future Considerations

- **Email reminders (T-7, T-3, T-1)** — dedicated email/Resend spec. Foundation laid.
- **Admin endpoint for `reconcile_subscription()`** — comes with admin UI.
- **Nightly drift-repair cron** — comes when we observe actual webhook miss rates.
- **`stripe_api_calls` table** (analog to `llm_call_logs`) — if Stripe-call volume becomes something we need to analyze.
- **Raw Elements card collection** — if we ever want to own the card-entry UX.
- **Usage-based / metered billing** — would require Stripe meter events + a usage-recording path.
- **Multi-org users** (teacher in multiple schools, parent and teacher in one account) — Clerk supports it; our schema has `users.organization_id` as a single FK, would need refactoring.
- **Proration & upgrades/downgrades** — Stripe handles default proration; custom logic comes later.
- **Annual plan variants** — add via new `plan` enum values + new Stripe prices.
- **Promo codes / coupons** — Stripe-side primitive; we'd expose via Checkout configuration.
- **Student-seat billing for teachers** — deferred.
- **School/district tier** — Phase 3.

## Implementation Overview

(Detailed in a subsequent implementation plan via the `writing-plans` skill.)

Rough shape:
1. Add `stripe` Python SDK to `apps/api/pyproject.toml`; `uv sync`.
2. Schema changes — update `Organization` model, add `Subscription` + `SubscriptionEvent` models; autogenerate + hand-review `0003_add_stripe_billing.py`; apply local.
3. Config extension — `stripe_secret_key`, `stripe_webhook_secret`, `stripe_price_parent_monthly`, `stripe_price_teacher_monthly` added to `config.py`; `.env.example` files updated.
4. `services/stripe_service.py` + `services/entitlements.py`.
5. Extend `auth/dependencies.get_current_user` lazy upsert: parent Clerk org creation, Stripe customer creation, trial subscription insertion, denormalization.
6. Webhook router (`routers/webhooks/stripe.py`) with signature verification, idempotency table, dispatch table.
7. Billing router (`routers/billing.py`) with `/api/me/entitlement`, `/api/billing/checkout`, `/api/billing/portal`.
8. Response schemas (`schemas/billing.py`).
9. Include billing + webhook routers in `main.py`.
10. Frontend: `TrialBanner`, `Paywall`, `/settings/billing`, `/paywall`, `/dashboard` update, `lib/api.ts` helpers.
11. README updates: Stripe dashboard setup, Stripe CLI webhook testing, test cards.
12. Acceptance run: local signup (parent + teacher) → Stripe customer in dashboard → hosted Checkout URL resolvable → webhook via `stripe listen` → DB row updates verified.
13. Deploy: Railway env vars, migration, webhook endpoint registration, prod verification.
