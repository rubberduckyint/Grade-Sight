# Cross-step followups

Items deliberately deferred from one v2 step to a later one, plus orphans
that don't map to any scheduled step. When you start a step, grep this file
for it; for orphans, surface them in planning.

The v2 sequence (Steps 01–15) is in §Implementation of
`docs/design/Grade Sight Handoff v2.html`. Step labels here mean v2 steps,
not Phase-1 specs.

## Launch sequence (re-ordered 2026-05-01)

The handoff doc's v2 sequence ended at Step 15 (Mobile upload), but two
launch-critical surfaces aren't on it: the teacher class flow and the
bulk-grade loop. Both are needed before a teacher can use the product
day-one. Re-sequenced to insert them ahead of print + mobile, plus a
navigation-polish step at the end. Step numbers stable through Step 13;
inserts use alpha suffixes so handoff-doc Step 14 / 15 references in
existing code/docs stay valid.

| Order | Step | Status |
|---|---|---|
| 13a | Archive + Keys (current brainstorm) | in design |
| 13b | Privacy (own brainstorm) | pending |
| 13c | **Teacher class-creation flow** (insert) | pending |
| 13d | **Bulk-grade workflow / "teacher loop"** (insert) | pending |
| 14 | Print intervention (handoff doc) | pending |
| 15 | Mobile upload (handoff doc) | pending |
| 15a | **Navigation polish** (insert) | pending |

## Step 13c · Teacher class-creation flow

Surfaced 2026-04-29 during the student-grade brainstorm; promoted to the
launch path 2026-05-01 — a teacher with 4-6 classes (typical real-world
load) needs class-scoping to actually use the product. Teacher creates a
named class (e.g., "second period") with a subject (dropdown of common
math courses + custom write-in for cases like "algebra zero period extra
help"), then adds students. Schema is fully ready: `classes` (Klass),
`class_members` (M2M with historical `left_at`), `assessments.class_id`
are all in place from Spec 2. Missing: `/api/classes` and
`/api/class-members` routers; UI for class create/list/edit; UI for
adding students to a class. Once shipped, the `/assessments` archive
(Step 13a) gets a `Class` column added — a one-line table change, not
a rewrite.

Common-math subject dropdown options (write-in supported as "Other…"):
Pre-Algebra · Algebra 1 · Geometry · Algebra 2 · Pre-Calculus · Calculus ·
Statistics.

## Step 13d · Bulk-grade workflow ("teacher loop")

Surfaced same brainstorm; promoted to the launch path 2026-05-01.
Teacher creates a test (= named answer key, e.g. "Chapter 2 Quiz 1"),
uploads the answer key once, then loops through the class roster:
per-student photo upload → analyze → print intervention (Step 14) →
next student. Schema supports it (multiple assessments share one
`answer_key_id`); missing is the queue-through UX. Depends on Step 13c
(class flow) — without classes there's no roster to loop through. Also
the natural home for **class-grade CSV export** (one row per student
in the class, columns: name, score, primary pattern, link to diagnosis)
— surfaced 2026-05-01; the v1 archive on `/assessments` does not need
its own CSV.

## Step 15a · Navigation polish

Surfaced 2026-05-01. Step 13a takes care of two cheap accessibility
fixes inline (skip-to-content link + focus-visible ring on tabs); this
step is the broader audit that didn't fit alongside Archive + Keys.

What we have today:

- Logo in `AppHeader` links to `/dashboard` (implicit "home" affordance).
- Top tabs (`TEACHER_TABS` / `PARENT_TABS`) — only on `/dashboard` until
  Step 13a hoists them to `lib/nav.ts` and applies them to `/students`,
  `/students/[id]`, `/assessments`, `/keys`.
- `<SectionEyebrow>` is decorative styling (mono uppercase tag, not
  clickable). Used today as a label like "Roster" or "Settings · Privacy".

What this step adds (audit + build):

- A real `<Breadcrumb>` component (clickable trail with " · " separator)
  for deep pages: `/assessments/[id]`, `/assessments/[id]/viewer`,
  `/students/[id]`, `/settings/*`, future `/glossary/[slug]` etc.
- Back-button affordance for routes that are 2+ levels deep
  (`/assessments/[id]/viewer` is the worst offender today — no clear
  way back to the diagnosis view except the browser button).
- **Click-target sizing pass** — current tabs are ~30px tall (passes WCAG
  AA 24×24, fails AAA 44×44). Bump vertical padding on primary nav.
- **Global search** — `Cmd-K` or top-bar search. A teacher with 50+
  assessments needs to find "Quiz 8.3" or a specific student fast. Scope
  decision: search by student name + assessment title (once class flow
  ships) + answer-key name. Brainstorm needed on results UX.
- **Narrow-viewport sweep** — district-issued laptops are still often
  1366×768. Verify `AppHeader` (logo + 4 tabs + org name + Upload CTA +
  UserButton) doesn't crowd at that width. May need to drop org-name
  display or move it into the avatar menu at narrower breakpoints.
- **Page H1 / tab-label alignment review** — "Students" tab → "Your
  students" H1; "Answer keys" tab → "Answer keys" H1. Decide the rule:
  match exactly for wayfinding, or allow editorial voicing? Currently
  inconsistent.
- Mobile nav layout — likely bundled with Step 15 (mobile upload work)
  rather than this step; this step is desktop-focused.

Cost estimate: ~2 days. Breadcrumb component + back affordances + click-
target pass + viewport sweep are mechanical; global search is its own
brainstorm and may split out into Step 15b if the design surfaces real
complexity.

### Error-pattern glossary + cross-app linking

Surfaced 2026-04-30 after Step 12 shipped. Patterns like "sign drop" or
"distributive-property error" are named in many places across the app
(TopSentence accent phrase on `/assessments/[id]`, PatternGroup headers,
ProblemRow "why" hint, RecentAssessmentsTable primary error column,
BiographySentence dominant pattern phrase, PatternTimeline row labels).
Right now those names are bare text — a parent or teacher who doesn't
recognize a label has no way to learn what it means.

Plan:
- New route (likely `/glossary` or `/patterns`) that lists every row in
  the `error_patterns` taxonomy table grouped by `error_subcategory` →
  `error_category`. Each entry: name, plain-language definition, an
  example, and what to do about it. Source of truth = the taxonomy table
  (already loaded at runtime per CLAUDE.md §3 "Taxonomy as data").
- Anchor IDs per pattern (`/glossary#pattern-{slug}` or by UUID).
- Wherever a pattern name is rendered, wrap it in a link to its glossary
  anchor. New shared component (e.g. `<PatternLink patternId={...}>`)
  to keep the link styling consistent and the slug logic in one place.
- Decide whether glossary content lives in the DB (extend
  `error_patterns` with `definition_md`, `example_md`, `intervention_md`)
  or in flat content files keyed by slug. DB is more consistent with the
  "taxonomy as data" rule but content files are easier to edit.
- Brainstorm before scheduling — needs a design pass on glossary IA
  (categories vs. flat list, search, parent-vs-teacher copy variants).

## Step 13a deferrals (Archive + Keys)

Items the Step 13a brainstorm (2026-05-01) intentionally pushed out:

- **Archive filters · post-MVP.** Step 13a ships with a Date filter
  only. **Pattern filter** (`?pattern_id=` joining problem_observations)
  and **Has-key filter** (`?has_key=true|false`) were both flagged as
  low-use advanced features; pair the Pattern filter with the glossary
  step (both are "let users navigate by pattern" UI). Has-key ships
  whenever someone asks for it — trivial backend change.
- **`/keys/[id]` rename/delete affordances.** A minimal detail page
  shipped with Step 13a (page thumbnails + back-link). Rename and
  delete affordances are still deferred — teachers can edit via
  `AnswerKeyPicker` on `/upload` in the meantime. Parsed-answer-item
  display also deferred to whenever the parser story gets attention.
- **"Verified vs draft" answer-key state.** The canvas mock shows a
  green "verified" / amber "draft" badge per key. We don't have a
  schema concept for verified state today (a key is just rows of
  parsed answers). Inventing one is a parser-confidence story —
  brainstorm separately when the answer-key parser gets attention.
- **Items count per key.** The canvas shows "12 items" alongside page
  count. We'd have to count parsed answer rows per key. Page count is
  close enough for v1; revisit if teachers ask for it.
- **Sortable table columns · post-MVP.** Both `/assessments` archive
  and `/keys` library are tables today; columns are not sortable.
  Standard pattern: click a column header to sort ascending, click
  again to flip to descending, click a third time to clear (or always
  toggle between asc/desc). Minimum coverage: Name (alpha) and Date
  (chrono) on `/keys`; Date and Student (alpha) on `/assessments`.
  Implementation note: sort state should be URL-bound (`?sort=name`,
  `?sort=-name` for desc) so back-button + share-link both work, and
  the backend should accept the same param so server-side ordering is
  authoritative — don't re-sort on the client. Pair with cursor
  pagination already in place: cursor needs to be keyed to whichever
  column is being sorted.

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
