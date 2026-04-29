# Cross-step followups

Items deliberately deferred from one v2 step to a later one. When you start
the destination step, grep this file for the step tag and resolve the entries.

## When you start v2 Step 11 (data aggregation)

- **Wire `/paywall` right-column trial stats.**
  - Source: Step 08b, `apps/web/lib/api.ts:102` (`TODO(step-11)`).
  - Action: replace the `getTrialStats(userId): null` stub with a real query
    that returns `{ assessmentCount, interventionCount, weeksOfHistory }`.
  - Where it renders: `apps/web/app/paywall/page.tsx` — right column is
    suppressed today; once stats return non-null, the canvas two-column
    layout activates automatically.
  - Origin decision (Step 08b): right column is conditional, not faked. Single-
    column paywall ships intentionally until real numbers exist.

## When you start v2 Step 13 (user settings polish)

- **Replace `/settings/profile` and `/settings/privacy` placeholder bodies.**
  - Source: Step 08b, both pages render "Coming soon — this lands in Step 13."
  - Files: `apps/web/app/settings/profile/page.tsx`,
    `apps/web/app/settings/privacy/page.tsx`.
  - Action: build the real bodies (name/email edit on Profile;
    privacy/data-export controls on Privacy). The `<SettingsLayout>` shell
    and top-tab nav are already in place.

- **Show real "Card on file" summary on `/settings/billing`.**
  - Source: Step 08b, `apps/web/app/settings/billing/page.tsx:130`
    (`TODO(billing-card-summary)`).
  - Action: expose `default_payment_method` on the entitlement response
    (Stripe `subscription` expand) and render brand + last4 (e.g.
    "Visa ···· 4242") in place of the current `—`.
  - Origin decision (Step 08b): em-dash is intentional. Stripe portal already
    handles all real card management via the existing "Manage billing in
    Stripe" CTA, so the dash is non-blocking until Step 13 polish.
