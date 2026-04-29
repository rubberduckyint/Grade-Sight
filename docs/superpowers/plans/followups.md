# Cross-step followups

Items deliberately deferred from one v2 step to a later one, plus orphans
that don't map to any scheduled step. When you start a step, grep this file
for it; for orphans, surface them in planning.

The v2 sequence (Steps 01–15) is in §Implementation of
`docs/design/Grade Sight Handoff v2.html`. Step labels here mean v2 steps,
not Phase-1 specs.

## Future v2 steps to schedule (not in current sequence)

These are real product surfaces the v2 design canvas hasn't covered yet.
Brainstorm and design before scheduling.

### Teacher class-creation flow

Surfaced 2026-04-29 during the student-grade brainstorm. Teacher creates a
named class (e.g., "second period") with a subject (dropdown of common math
courses + custom write-in for cases like "algebra zero period extra help"),
then adds students. Schema is fully ready: `classes` (Klass), `class_members`
(M2M with historical `left_at`), `assessments.class_id` are all in place
from Spec 2. Missing: `/api/classes` and `/api/class-members` routers; UI
for class create/list/edit; UI for adding students to a class.

Common-math subject dropdown options (write-in supported as "Other…"):
Pre-Algebra · Algebra 1 · Geometry · Algebra 2 · Pre-Calculus · Calculus ·
Statistics.

### Bulk-grade workflow ("teacher loop")

Surfaced same brainstorm. Teacher creates a test (= named answer key, e.g.
"Chapter 2 Quiz 1"), uploads the answer key once, then loops through the
class roster: per-student photo upload → analyze → print intervention
(Step 14) → next student. Schema supports it (multiple assessments share
one `answer_key_id`); missing is the queue-through UX. Probably depends
on the class flow above.

## Paywall right-column trial stats — opportunistic

- **Marker:** `apps/web/lib/api.ts:102` (`TODO(step-11)` — historical tag,
  see note below).
- **Where it renders:** `apps/web/app/paywall/page.tsx` — right column is
  suppressed today; once `getTrialStats(userId)` returns non-null, the
  canvas two-column layout activates.
- **Action:** replace the `null` stub with a real query that returns
  `{ assessmentCount, interventionCount, weeksOfHistory }`.
- **Origin decision (Step 08b):** right column is conditional, not faked.
  Single-column paywall ships intentionally until real numbers exist.
- **Step assignment:** **none in the v2 sequence is a clean fit.** The
  Step 08b plan optimistically tagged "Step 11," but Step 11 is
  *Inline correction + viewer*, which doesn't touch trial-stats queries.
  Step 12 (*Student Page biography*) is the closest neighbor — it builds
  longitudinal-aggregate queries that overlap with weeksOfHistory and
  assessmentCount. Pick up either alongside Step 12 if the queries
  generalize, or as a small opportunistic backend PR sooner. The
  `TODO(step-11)` tag is preserved as a grep breadcrumb to the historical
  intent — do not read it as a current commitment.

## Card-on-file summary on /settings/billing — opportunistic, low priority

- **Marker:** `apps/web/app/settings/billing/page.tsx:130`
  (`TODO(billing-card-summary)`).
- **Action:** expose `default_payment_method` on the entitlement response
  (Stripe `subscription` expand) and render brand + last4 (e.g.
  "Visa ···· 4242") in place of the current `—`.
- **Origin decision (Step 08b):** em-dash is intentional. Stripe portal
  already handles all real card management via the existing "Manage
  billing in Stripe" CTA, so the dash is non-blocking.
- **Step assignment:** **none.** No v2 step touches billing display
  polish. Pick up whenever (small API change + UI swap).

## /settings/privacy body — Step 13

- **Files:** `apps/web/app/settings/privacy/page.tsx` (currently
  "Coming soon — Step 13" stub inside the `<SettingsLayout>` shell).
- **Step assignment:** **Step 13 · Operational Surfaces.** The handoff
  doc explicitly schedules `/settings/privacy` as part of Step 13
  (alongside `/assessments` and `/keys` per the Supporting Surfaces
  canvas). When you start Step 13, replace the stub body with the real
  privacy / data-export controls; the shell is already wired.

## /settings/profile body — ORPHAN, needs scheduling

- **Files:** `apps/web/app/settings/profile/page.tsx` (currently
  "Coming soon — Step 13" stub).
- **Problem:** the v2 sequence (Steps 01–15) does not schedule
  `/settings/profile` anywhere. The Step 08b plan said "lands Step 13,"
  and the stub copy still says so, but Step 13 only covers
  `/settings/privacy`. The page has no scheduled implementer.
- **Action needed:** decide one of —
  - (a) defer indefinitely, leave the stub forever (acceptable if Profile
    is non-MVP);
  - (b) bundle into Step 13 informally (add it to the Step 13 plan when
    that plan is written);
  - (c) add a tail step (Step 16+) for Profile + any other account-polish
    that doesn't fit elsewhere.
- The stub copy currently lies ("lands Step 13"). Update it once the
  scheduling decision is made.
