# Step 08a · Trial surfaces

**Status:** in progress — split from Step 08 on 2026-04-29 to keep PR scope manageable.
**Reference:** `docs/design/Grade Sight Handoff v2.html` §Step 08 (Implementation), `docs/design/Grade Sight Billing.html` (canvas), `docs/design/session-b-billing.jsx` (visual reference).
**Branch:** `step-08a-trial-surfaces`.

## Scope

The two **inline-during-flow** billing surfaces only:

- `components/trial-banner.tsx` — the four-tone banner that appears on `/dashboard` while a user is on trial.
- `components/paywall-inline.tsx` — the embedded paywall block used when a free-trial user hits a paid feature.

Plus the cross-cutting plumbing both surfaces need:

- `GET /api/billing/prices` — public endpoint that resolves the price IDs in `.env` to live Stripe amounts, served from a 1h in-process TTL cache.
- `lib/api.ts#fetchPrices()` — frontend client.

The dedicated-page surfaces (`/paywall`, `/settings/billing`) and the settings layout shell are **deferred to Step 08b**.

## Decisions locked in this plan

1. **Pricing source.** `.env` holds Stripe price IDs (e.g. `STRIPE_PRICE_PARENT_MONTHLY=price_…`); dollar amounts live in Stripe. The new endpoint resolves them at request time. Canvas dollar figures (`$15`, `$25`, `$29`) are placeholders and never bind.
2. **Price endpoint shape.** Separate `GET /api/billing/prices` (not folded into `/api/me/entitlement`). Entitlement is per-user; prices are global, and pre-auth surfaces (`/paywall`) need them. Public, no-auth.
3. **TTL cache.** Module-level `dict[price_id, (PriceInfo, expires_at)]` with 1h TTL. Acceptable for single-instance deploys; comment in source flags the swap to a shared cache (Redis) when we go horizontal.
4. **Urgent banner color.** Border = `border-insight` (amber); eyebrow text = `text-mark` (red). Per the canvas, not the prior code. The Step 07 red carve-out is strictly scoped to `/error` — TrialBanner is *not* covered by it. Sibling `docs:` commit on this branch updates the §Tokens callout to spell that out.

## Implementation outline

### Backend

- `services/stripe_pricing.py` — new module with `get_all_prices()` and a private `_cache` keyed by price ID. `stripe.Price.retrieve_async` per uncached/expired entry; cache writes record `expires_at = monotonic() + 3600`.
- `schemas/billing.py` — add `PriceInfo` and `PricesResponse`.
- `routers/billing.py` — add `GET /api/billing/prices` route. No `Depends(get_current_user)`.
- Tests: stub `stripe.Price.retrieve_async`, verify cache hit-on-second-call, verify shape of response, verify both plans returned.

### Frontend

- `lib/types.ts` — add `PriceInfo`, `PricesResponse`.
- `lib/api.ts` — add `fetchPrices()`. No auth header.
- `components/trial-banner.tsx` — rewrite for canvas:
  - Layout: full-width row with `border-t border-rule-soft` and `border-b` colored by tone (rule for calm/insight, **insight** for urgent — amber, not red).
  - Backgrounds: `paper-soft` / `insight-soft` / `paper-deep` per tone.
  - Eyebrow: day-count format (`≤ 7 DAYS`, `≤ 3 DAYS`, `LAST DAY`); urgent eyebrow uses `text-mark`.
  - Body copy: per-tone canvas wording, with the day-count phrase wrapped in `font-serif italic`.
  - New required prop `priceLabel: string` (pre-formatted, e.g. `$15/month`); replaces hardcoded `$15`/`$29`.
- `app/dashboard/page.tsx` — fetch prices alongside entitlement, format with `Intl.NumberFormat`, pass to `<TrialBanner>`.
- `components/paywall-inline.tsx` — add optional `onDismiss?: () => void`. When present, render a `Not now` ghost-style link beside `Add card`.

## Verification

- `pnpm --filter web typecheck` clean.
- `pnpm --filter api test` clean (pricing service + endpoint covered).
- TrialBanner rendered via Chrome MCP at all four tones (parent calm, parent insight, parent urgent, teacher calm) — confirm border colors, eyebrow copy, body italic, priceLabel from Stripe.
- PaywallInline rendered via Chrome MCP — confirm both buttons present when `onDismiss` provided.

## PR description (six-heading template from `feedback_workflow.md`)

- **Step:** 08a — Trial surfaces.
- **What:** TrialBanner canvas-aligned (full-width row, day-count copy, serif-italic day phrase, amber urgent border, red urgent eyebrow). PaywallInline gains optional `Not now`. New public `GET /api/billing/prices` with 1h in-process TTL cache resolves the price IDs in `.env` to live Stripe amounts. Frontend `fetchPrices()` + dashboard wiring. Sibling `docs:` commits split Step 08 → 08a/08b in the impl order, scope the red carve-out strictly to `/error` (TrialBanner uses `border-insight`).
- **Tokens used:** TBD per actual diff.
- **Verification:** typecheck + tests clean; Chrome MCP renders for all four tones + PaywallInline.
- **Seven-item checklist:** TBD per actual diff.
- **Open questions / provisional decisions:** TBD.
