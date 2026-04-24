# Stripe Integration Spec

## Context

The app currently has Clerk auth, the diagnostic engine scaffolding, and the basic data model in place. We're adding subscription billing as an MVP feature, not deferring it. The goal is to have every user on a subscription state machine from signup, with a no-card free trial as the default onboarding path.

Defaults assumed in this spec — flag any that don't match reality and I'll adjust:
- Direct Stripe integration, not Clerk Billing (more code, but keeps us portable)
- No-card trial: signup → 30-day trial → prompted to add card before expiration
- Two products at launch: Parent ($15/mo) and Teacher ($25/mo), monthly only. Annual tiers deferred.
- Existing `users` table has a `role` enum (parent, teacher, admin) and users belong to an `organization` (solo org auto-created for parents)

## Architectural Alignment

This integration must follow the patterns already established in the codebase:

- **External service abstraction**: all Stripe API calls go through a `services/stripe_service.py` module. No direct `stripe.X.create()` calls scattered through routes or business logic. The service layer logs every call, records timing and outcome, and writes to `audit_log` when subscription state changes.
- **Soft deletion**: subscription records never hard-delete. Cancellations set status fields; data retention follows the same 30-day window as the rest of the app.
- **Multi-tenancy**: subscriptions belong to an `organization_id`, not a `user_id`. A parent's solo org owns their subscription; a teacher's org owns theirs. This sets up cleanly for the future school/district tier where one org has one subscription covering many users.
- **Audit log**: every subscription state change writes an audit log entry (created, trial_started, trial_ended, activated, payment_failed, canceled, reactivated).
- **Webhook pattern**: follow the existing Clerk webhook handler structure for the Stripe webhook endpoint. Signature verification is non-negotiable.

## Database Schema Additions

New `subscriptions` table:
- `id` (UUID, primary key)
- `organization_id` (UUID, FK to organizations, unique — one active subscription per org)
- `stripe_customer_id` (text, indexed)
- `stripe_subscription_id` (text, nullable — null during trial before card is added)
- `plan` (enum: `parent_monthly`, `teacher_monthly`; extensible)
- `status` (enum: `trialing`, `active`, `past_due`, `canceled`, `incomplete`)
- `trial_ends_at` (timestamp, nullable)
- `current_period_end` (timestamp, nullable)
- `cancel_at_period_end` (boolean, default false)
- `created_at`, `updated_at`, `deleted_at`

New `subscription_events` table (for webhook idempotency and debugging):
- `id` (UUID, primary key)
- `stripe_event_id` (text, unique — prevents double-processing)
- `event_type` (text)
- `subscription_id` (UUID, FK to subscriptions, nullable)
- `payload` (JSONB — full webhook payload for reconstruction)
- `processed_at` (timestamp)
- `created_at`

Add to existing `organizations` table:
- `subscription_status` (enum, denormalized from subscriptions.status for fast entitlement checks) — updated by webhook handler

The denormalization is intentional. Entitlement checks run on every gated request; we don't want them joining across tables or hitting Stripe on every call.

## Stripe Setup (manual, one-time)

In the Stripe dashboard (test mode first, then mirrored in live):
- Create two products: "Parent Plan" and "Teacher Plan"
- Create monthly recurring prices: $15 and $25 respectively
- Record the price IDs in env vars: `STRIPE_PRICE_PARENT_MONTHLY`, `STRIPE_PRICE_TEACHER_MONTHLY`
- Configure the Customer Portal (users will manage their own cards, cancellations, invoices through this)
- Set up the webhook endpoint pointing at `/api/webhooks/stripe` and record `STRIPE_WEBHOOK_SECRET`
- Enable Stripe Tax (optional for MVP, but low-effort to turn on)

Env vars needed:
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PARENT_MONTHLY`
- `STRIPE_PRICE_TEACHER_MONTHLY`

## Trial State Machine

The no-card trial flow:

1. **Signup** (Clerk webhook → our user.created handler): create Stripe customer for the user's org. Create a `subscriptions` row with status=`trialing`, `trial_ends_at` = now + 30 days, `stripe_subscription_id`=null. No Stripe subscription object yet — we're tracking the trial locally until they add a card.

2. **During trial**: `hasActiveSubscription()` returns true. App shows trial-remaining banner starting at day 23 (7 days left). Email reminders at T-7, T-3, T-1.

3. **User adds card** (via Stripe Checkout or embedded Elements): create the Stripe subscription with `trial_end` set to match our local `trial_ends_at`. Webhook updates our `stripe_subscription_id`. Status stays `trialing` until trial ends, then Stripe transitions it to `active` on first successful charge.

4. **Trial ends without card**: status → `canceled`. Entitlement check returns false. User sees paywall with "add card to reactivate" CTA. Data is preserved (soft deletion rules apply).

5. **Payment fails**: status → `past_due`. Entitlement check returns true for a 3-day grace period (via Stripe's smart retries), then false. User sees "update payment method" banner.

6. **User cancels**: `cancel_at_period_end=true`, status stays `active` until period ends. Entitlement stays true through the paid period. Then status → `canceled`.

## Webhook Handler Contract

Endpoint: `POST /api/webhooks/stripe`

Process in order:
1. Verify signature using `STRIPE_WEBHOOK_SECRET`. Reject on failure.
2. Check `subscription_events` for `stripe_event_id` — if exists, return 200 immediately (idempotency).
3. Insert into `subscription_events` with `processed_at=null`.
4. Dispatch on `event_type` to handler. Handlers must be idempotent — same event processed twice yields same end state.
5. Update `subscription_events.processed_at` on success. On failure, leave null and return 500 so Stripe retries.

Events to handle for MVP:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.trial_will_end` (for email hooks)

Every handler writes to `audit_log` and updates the denormalized `organizations.subscription_status`.

## Entitlement Helper

Single entry point for every gated feature:

```python
# services/entitlements.py
def has_active_subscription(organization_id: UUID) -> bool:
    """
    Returns True if the org has an entitled subscription state.
    Reads from denormalized organizations.subscription_status.
    Active states: trialing, active, past_due (within grace period)
    Inactive states: canceled, incomplete
    """
```

Do NOT check Stripe directly in this helper — too slow, and Stripe is not the source of truth for entitlement during normal operation (our webhook-populated DB is). Add a separate `reconcile_subscription(org_id)` function for explicit drift repair; call it from an admin endpoint and a nightly cron.

Every gated route uses this helper. Frontend mirrors it via a `/api/me/entitlement` endpoint that returns `{ status, trial_ends_at, current_period_end }` for UI state.

## Frontend Components

- **Trial banner**: shows remaining days, visible on dashboard starting at 7 days left
- **Paywall**: shown when entitlement check fails; explains state (trial expired vs payment failed vs canceled) and routes to Stripe Customer Portal or Checkout as appropriate
- **Settings → Billing page**: shows current plan, status, next billing date, link to Customer Portal
- **Checkout flow**: "Add card" button → Stripe Checkout session (hosted) → redirect back to app. Don't build embedded card collection for MVP; hosted Checkout is faster and handles 3D Secure, SCA, Apple/Google Pay for free.

## Testing

- Use Stripe test mode keys for all development
- Use Stripe CLI (`stripe listen --forward-to localhost:PORT/api/webhooks/stripe`) for local webhook testing
- Add a test helper that creates an org in any subscription state for fixture setup
- Entitlement helper must have unit tests covering every state combination
- Webhook handler must have integration tests with real Stripe test events

## Do NOT Do Yet

- No annual plans (defer until there's data on monthly churn)
- No promo codes / coupons
- No proration logic beyond what Stripe handles automatically
- No multi-seat teacher plans (one subscription = one teacher for MVP)
- No school/district tier (phase 3)
- No usage-based billing / metered pricing
- No in-app card collection — hosted Checkout only
- No custom invoice PDFs — Stripe's defaults are fine
- No dunning email sequences beyond trial-ending reminders — rely on Stripe's built-in retry emails for failed payments

## Output

At the end of this session:
- Migrations applied for `subscriptions`, `subscription_events`, and `organizations.subscription_status` column
- `services/stripe_service.py` wrapping all Stripe API calls with logging
- `services/entitlements.py` with `has_active_subscription()` and `reconcile_subscription()`
- Webhook handler at `/api/webhooks/stripe` with signature verification and idempotency
- Clerk `user.created` webhook extended to create Stripe customer and trial subscription row
- `/api/me/entitlement` endpoint
- Frontend trial banner, paywall component, and billing settings page
- Stripe Checkout integration for card collection
- Test coverage for entitlement helper and webhook handler

Please confirm you've read this spec, ask clarifying questions about anything ambiguous (especially around existing code structure the spec assumes), then lay out your implementation plan before starting.
