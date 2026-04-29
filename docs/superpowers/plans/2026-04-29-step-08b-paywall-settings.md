# Step 08b · Paywall page + Settings billing

**Status:** queued — awaiting Step 08a merge.
**Reference:** `docs/design/Grade Sight Handoff v2.html` §Step 08 (Implementation), `docs/design/Grade Sight Billing.html`, `docs/design/session-b-billing.jsx`.
**Branch when ready:** `step-08b-paywall-settings`.

## Scope

The two **dedicated-page** billing surfaces, plus the settings shell that hosts one of them:

- `app/paywall/page.tsx` — three server-branched states (`trial-ended`, `canceled`, `past-due`), 1100px two-column layout, 64px serif headline with italic span, lead paragraph, primary + secondary CTAs, reassure microcopy. Right column conditional on data availability.
- `app/(authed)/settings/layout.tsx` — new `<SettingsLayout>` shell with left-rail nav. Tabs: **Profile** (placeholder, lands Step 13), **Privacy** (placeholder, lands Step 13), **Billing** (active in this PR), Notifications omitted from nav.
- `app/(authed)/settings/profile/page.tsx`, `app/(authed)/settings/privacy/page.tsx` — placeholder routes that render `<SettingsLayout>` shell with one-line "Coming soon — this lands in Step 13" body. ~10 lines each.
- `app/settings/billing/page.tsx` — rewrite to canvas: plan card with 3-grid metadata (Renews / Card on file / Started), `ACTIVE` accent-pill badge, "Manage billing in Stripe" primary, sidebar with "Change plan" + "Questions?" mini-cards. **No inline invoice list** — defer to Stripe portal.

## Decisions locked in this plan

1. **Right column on `/paywall` is conditional.** Real numbers (`assessmentCount`, `interventionCount`, `weeksOfHistory`) or omit cleanly. Never lorem counts. Implementation: a thin server function `getTrialStats(userId)` returning `{...} | null` (returns null today). Right column renders only if non-null. Left column (pricing + CTAs) always carries the page.
2. **Invoice list defers to Stripe portal.** Canvas showed inline as aspiration; the right call is one-line mono microcopy ("Invoices, payment methods, and receipts") plus the existing "Open Stripe billing portal" CTA. Sibling `docs:` commit on this branch reconciles §Routes for `/settings/billing` to spell that out: *"Plan + payment-method summary inline. Invoice list and receipts open Stripe portal in new tab."*
3. **Settings tabs: introduce shell now, build only Billing.** `<SettingsLayout>` lands in this PR. Profile/Privacy render placeholder bodies — never 404. Notifications is omitted from nav (no roadmap).
4. **Follow-up issue.** Open `Wire /paywall right-column trial stats — assessmentCount, interventionCount, weeksOfHistory queries` and tag for Step 11 (likely lands with the data-aggregation work).
5. **Recommendations locked at PR-draft time (2026-04-29).** All three deferred items are indexed in `docs/superpowers/plans/followups.md`. Step assignments below were corrected after a re-read of the v2 implementation sequence — the v2 doc is the source of truth, not the historical "Step 11"/"Step 13" tags in this plan.
   - Single-column `/paywall` ships intentionally — no faked stats. **No v2 step is a clean fit for the trial-stats queries** (Step 11 is *Inline correction + viewer*, not data aggregation). Step 12 (Student Page biography) is the closest neighbor; pickup is opportunistic. The `TODO(step-11)` tag in `lib/api.ts:102` is preserved as a historical breadcrumb only.
   - "Card on file" em-dash ships intentionally — Stripe portal handles all real card management today. **No v2 step covers this**; pickup is opportunistic. `TODO(billing-card-summary)` left in `app/settings/billing/page.tsx`.
   - `/settings/privacy` ships as a `<SettingsLayout>`-wrapped stub — replaced in **Step 13 (Operational Surfaces)** per the v2 doc, which explicitly schedules `/settings/privacy`.
   - `/settings/profile` ships as a stub but is an **orphan** — no v2 step schedules it. Stub copy still says "lands Step 13" (carried over from the original plan); update once a scheduling decision is made (defer indefinitely / bundle into Step 13 / add a tail step).

## Implementation outline

### Backend

- `getTrialStats(userId)` server function (Next server-only or new API endpoint, TBD at implementation time). For Step 08b, returns `null` with a `TODO(step-11)` comment pointing to the follow-up issue.

### Frontend

- `app/paywall/page.tsx` — rewrite per canvas; consumes `fetchPrices()` (added in 08a) for the primary CTA label.
- `app/(authed)/settings/layout.tsx` — new shell.
- `app/(authed)/settings/profile/page.tsx` — placeholder body.
- `app/(authed)/settings/privacy/page.tsx` — placeholder body.
- `app/settings/billing/page.tsx` — rewrite per canvas (no invoice list).

### Doc patches (sibling commits on this branch)

- `docs: /settings/billing invoices defer to Stripe portal (canvas-doc reconciliation)` — update §Routes.

## Verification

- `pnpm --filter web typecheck` clean.
- Chrome MCP screenshots for all three `/paywall` branches (trigger via env mock or query string in dev).
- `/settings/billing`, `/settings/profile`, `/settings/privacy` all render their respective shells without 404.

## PR description (six-heading template)

- **Step:** 08b — Paywall + Settings billing.
- **What:** TBD per actual diff.
- **Tokens used:** TBD.
- **Verification:** TBD.
- **Seven-item checklist:** TBD.
- **Open questions / provisional decisions:** TBD.
