# Grade-Sight — State of the Project & Feature Roadmap

**Generated:** 2026-04-28
**For:** Claude Design (UX wireframing pass)
**Replaces:** the 2026-04-24 inventory, which was scoped to the editorial-theme retrofit and is now obsolete.

This document is the briefing pack a designer needs to draft wireframes for the next phase of Grade-Sight. It covers (1) what the product *is*, (2) what's *built today*, (3) the *visual system* already in place, (4) the *current user journeys*, (5) *known UX gaps*, (6) the *roadmap of features* that need design work, and (7) the *constraints* designs must honor.

When wireframes come back, they'll be implemented page-by-page against this state.

---

## 1. Product in one paragraph

Grade-Sight is a diagnostic grading platform for **secondary math** (Algebra → Pre-Calc, CA Common Core). Upload a photo of a student's quiz; the engine returns three things per problem: **a grade, an error pattern, and a step-by-step solution**. The differentiator is *why*-not-just-*where*: a four-category error taxonomy (conceptual, execution, verification, confidence/strategy) loaded from the database. Two audiences ship from MVP day one — **parents** (one to a few students, usually working with already-graded papers their kid brings home) and **individual teachers** (their own classes, working with ungraded student work plus their own answer key). District/admin sales are deferred to Phase 3.

**Privacy is positioned as an acquisition lever, not fine print** — never sell student data, no ads/profiling, US-only data, 30-day deletion, 72-hour incident notification, SDPC NDPA signable, Student Privacy Pledge signatory. Trust signals belong on visible surfaces, not buried in a policy page.

---

## 2. Audiences and roles

Three roles exist in the data model. Two ship in v1.

| Role | Status | Primary mental model | Mode that wins |
|---|---|---|---|
| **parent** | shipping | "My kid brought home a graded quiz; help me understand what they got wrong and how to help." | `already_graded` (engine reads teacher's red marks) |
| **teacher** | shipping | "I have a class set of ungraded papers and my own answer key; grade them and tell me what patterns I'm seeing." | `with_key` (engine grades against uploaded answer key) |
| **admin** | not yet user-facing | (deferred to Phase 2+) | — |

UI today branches by role in two places: the upload form's prominence (parents see "already graded" first, teachers see the answer-key picker first) and the trial banner copy. Designs should preserve this branching while keeping the visual chrome unified.

---

## 3. What's built today (Phase 1, Specs 1–12 ✅)

### 3.1 Routes shipped

| Route | Auth | What it does |
|---|---|---|
| `/` | public | Marketing landing — hero, dual CTAs (parent / teacher signup), trust band, sign-in link |
| `/sign-in/[[...sign-in]]` | public | Clerk hosted `<SignIn />` |
| `/sign-up/parent/[[...sign-up]]` | public | Clerk `<SignUp />` with `unsafeMetadata.role = "parent"` |
| `/sign-up/teacher/[[...sign-up]]` | public | Clerk `<SignUp />` with `unsafeMetadata.role = "teacher"` |
| `/dashboard` | auth | Greeting, trial banner (when ≤7 days), big "Upload assessment" CTA, recent-assessments list (last 10), empty state |
| `/upload` | auth | Multi-page assessment upload form: student picker (or inline create), file picker (1–20 image pages), optional answer-key picker (teacher-prominent) **or** "already graded" checkbox (parent-prominent) |
| `/assessments/[id]` | auth | Assessment detail: header (student, status badge, mode badge, page count), diagnosis section (run-button → processing → results), page thumbnails |
| `/students` | auth | Student roster — list + inline add-student form |
| `/paywall` | auth | Inline paywall page (entitlement gate) |
| `/settings/billing` | auth | Plan, status, trial-end / next-billing, "Manage billing" → Stripe Customer Portal |
| `error.tsx`, `not-found.tsx`, `loading.tsx` | — | Global error / 404 / loading shells |

### 3.2 Components shipped

**App chrome:** `AppShell`, `AppHeader`, `PageContainer`, `SerifHeadline`, `SectionEyebrow`, `TrustBand`, `EmptyState`.

**Domain-specific:**
- Auth-adjacent: `TrialBanner` (gentle T-7 nudge, role-aware copy), `PaywallInline`.
- Roster: `AddStudentForm`, `StudentPicker`.
- Upload: `AssessmentUploadForm` (the orchestrator), `AnswerKeyPicker`, `AnswerKeyUploadForm`.
- Assessment view: `RunDiagnosticButton`, `DiagnosisDisplay`, `DeleteAssessmentButton`.
- Lists: `RecentAssessmentsList`.

**shadcn/ui primitives installed:** `Button`, `Card`, `Badge`, `Alert`, `Avatar`, `Dialog`, `DropdownMenu`, `Separator`, `Skeleton`, `Sonner` (toasts).

**Backend surfaces (no UI but already exposed via API):**
- Assessments CRUD, multi-page upload, presigned R2 URLs.
- Answer keys CRUD, multi-page upload, picker-friendly summaries.
- Diagnostic engine (`POST /api/assessments/{id}/diagnose`) — three modes (`auto_grade`, `with_key`, `already_graded`), wrong-only output for graded modes, full taxonomy lookup.
- Stripe billing (entitlement, checkout, portal, webhook).
- Audit log, LLM call log, taxonomy seed (4 categories × 16 subcategories × 29 patterns).

### 3.3 Visual system already in place ("Gradelens Editorial")

This is the design language that should carry into every new wireframe. Don't propose a different one — extend this.

- **Type:** Source Serif 4 (display + headlines), Inter (body + UI), JetBrains Mono / `font-mono` (eyebrows, metadata, status badges in tracked uppercase).
- **Headline scale:** custom `<SerifHeadline>` component with three levels — `greeting` (largest, dashboard hello), `page` (page H1), `section` (within-page H2).
- **Eyebrows:** `<SectionEyebrow>` — small uppercase tracked label that sits above headlines, sets editorial tone.
- **Color palette (CSS tokens in `app/globals.css`):**
  - `paper`, `paper-soft` — warm off-white backgrounds
  - `ink`, `ink-soft`, `ink-mute` — warm near-black text ramp
  - `rule`, `rule-soft` — hairline dividers and borders
  - Pen-ink blue accent — buttons, links
  - Amber — reserved for *diagnostic insight moments* (a wrong-answer card, a pattern callout). Do not use amber for generic warnings.
  - `mark` — for genuine error/destructive states (failed assessments, delete confirmations).
- **Radii:** `--radius-sm` for cards/panels (modest, not soft).
- **No red/green right-wrong color logic** in diagnostic output — supportive, not punitive. (See §7.)

The Claude.ai-rendered HTML files (`docs/Grade Sight Foundation.html`, `Diagnostic Reveal.html`, `Billing.html`, `Handoff.html`) are the canonical references for the editorial language. New wireframes should feel like extensions of those, not departures from them.

---

## 4. Current user journeys (what works end-to-end today)

### 4.1 Parent journey (primary v1 flow)

1. Land on `/` → "Sign up as parent" → Clerk parent signup.
2. After verify, land on `/dashboard` (greeting + empty state + "Upload assessment" CTA).
3. Add a student (`/students` or inline from upload form) — name, optional DOB.
4. `/upload` → pick student → upload page photos (1–20 images) → check **"this is already graded"** (parent-prominent) → submit.
5. Land on `/assessments/[id]` with status `pending`. Tap "Run diagnostic." Wait ~30s.
6. Status flips to `completed`; `<DiagnosisDisplay>` renders **wrong-only** problem cards (e.g., "4 of 18 need review"), each with the engine's reading of the problem, the error pattern, and step-by-step solution.

### 4.2 Teacher journey (primary v1 flow)

1. Land on `/` → "Sign up as teacher" → Clerk teacher signup (creates organization).
2. `/dashboard` → upload → pick student → upload pages → **answer-key picker prominent** → either pick a previously-uploaded key or upload a new one inline → submit.
3. Same `/assessments/[id]` view; mode badge shows "Graded with [Key Name]." Wrong-only output by default.

### 4.3 Trial / billing

- 14-day trial starts on signup; `<TrialBanner>` appears on dashboard at T-7. Add card → Stripe Checkout → return to dashboard.
- If entitlement fails on a gated action, user lands on `/paywall` with branched copy (trial-ended / canceled / past-due).

---

## 5. Known UX gaps in shipped surfaces

Designers should treat these as open questions, not as locked-in problems to recreate.

1. **Dashboard is thin.** Greeting + one CTA + recent list. There's no longitudinal signal yet — no "patterns this student keeps showing," no "% of recent problems correct," no streak/recency prompt. With the engine producing real diagnoses, the dashboard is the natural place to surface running-pattern insight per student.
2. **`/students` is barebones.** A list and an add-form. No per-student detail page exists yet. There is **no `/students/[id]`** — clicking a student name does nothing. This is the single biggest gap before launch: longitudinal value lives on a per-student view.
3. **`<DiagnosisDisplay>` is a flat list of cards.** Wrong-only output works, but there's no aggregate framing ("3 of these 4 errors are the same sign-distribution pattern — here's the intervention"), no pattern callout, no "next steps" CTA. The engine produces the data; the UI does not yet narrate it.
4. **No assessment-list page.** `/dashboard` shows the last 10; there's no `/assessments` archive, no filtering, no per-student grouping.
5. **No global navigation beyond the header.** `<AppHeader>` has the user menu; there's no left-nav or top-nav linking dashboard ↔ students ↔ upload ↔ billing. New users can get to upload but the path back to students or to a settings tree is muddy.
6. **Empty states are present but minimal.** `<EmptyState>` exists for the dashboard and roster; assessment detail's pending/processing/failed states are functional but not yet emotionally calibrated for the audiences (a parent staring at "Processing — about 30 seconds" is a different moment than a teacher batching uploads).
7. **No trust surface beyond the landing trust band.** The privacy story is the acquisition lever, but in-product (after signup) there's nowhere it shows up. A `/settings/privacy` or in-context "your data is..." moment is unbuilt.
8. **Mobile is untested.** The shell is responsive in the Tailwind-default sense, but the upload flow specifically (file picker + key picker + role-branched layout) has not been designed for narrow viewports.
9. **Diagnostic detail has no answer-key viewer.** Teachers using `with_key` mode can't see their own key alongside the student's pages. The mode badge says "Graded with [Key Name]" but there's no link or thumbnail.
10. **No editing/correction UI.** The engine is correct most of the time, not all the time; teachers will want to mark "this isn't actually wrong" or "the pattern is wrong." `diagnostic_reviews` is in the data model but has no front-end surface.

---

## 6. Roadmap of features that need design work

Numbered roughly in the order they will be implemented. Wireframes are most useful for items 1–6; items 7+ are still loose enough that brainstorming-then-spec should come first.

### Near-term (next 2–3 implementation specs)

1. **Per-student detail page (`/students/[id]`).** **Highest priority.** The home for longitudinal insight. Should answer: *what error patterns recur for this student, across which assessments, with what trend?* Needs a header (student name, class/grade if present, date added), a recent-assessments timeline, a patterns-over-time visual, and CTAs to upload a new assessment or open the most recent one. Mobile-aware. This is the "why someone comes back to the product weekly" surface.

2. **Diagnosis narrative redesign.** Rework `<DiagnosisDisplay>` from a flat card list into a layered story:
   - **Top:** aggregate insight ("Marcus got 14 of 18, but 3 of the 4 he missed share the same pattern: sign errors when distributing").
   - **Middle:** per-pattern grouping (cards grouped by `error_pattern_id`, with the pattern named once).
   - **Bottom:** per-problem detail (what's there today: student answer, correct answer, solution steps).
   - Should accommodate three modes (`auto_grade`, `with_key`, `already_graded`) — the framing copy differs per mode.

3. **Global navigation.** A consistent nav primitive (top-bar tabs or a left-rail) linking Dashboard / Students / Upload / Billing. Role-aware (teachers see "Classes" eventually; parents may not). This is small in scope but unblocks every page after it.

4. **Assessments archive (`/assessments`).** Filterable / groupable list of every assessment the user has uploaded. Grouped by student by default; sort by date. Empty state when none.

5. **Answer key library page (or inline expansion).** Teachers will accumulate keys. Today the only access path is the picker inside `/upload`. Either a dedicated `/answer-keys` page or a "manage keys" affordance in settings — needs design judgment on whether it's a first-class surface or a settings-tray.

6. **Inline diagnostic correction UI.** A way for teachers to mark a problem as "actually correct" or override the pattern. Logs to `diagnostic_reviews` (already in schema). Quiet, not disruptive — should feel like editing a doc, not filing a bug. Per-card edit affordance + an undo path.

### Phase 1 finishing (before public launch)

7. **Trust + privacy surface, in-product.** A `/settings/privacy` or equivalent. Subprocessor list, deletion request flow, consent flag display per student, "download your data" affordance. The marketing-facing privacy promises need an in-product mirror to be credible.

8. **Onboarding tour / first-run state.** A new user landing on `/dashboard` with no students, no assessments, and no answer keys today sees one CTA. There's no nudge toward "add a student first" or "upload an answer key first" (for teachers). Designs should consider a 2–3 step setup checklist or a guided first-upload.

9. **Class grouping (teacher-only).** Currently teachers add students one-by-one with no class container. Schema supports it (`classes`, `class_members`); UI does not. A `/classes` index + `/classes/[id]` detail (student roster + class-wide pattern surfacing) is the bottoms-up SaaS wedge surface.

10. **Email-driven re-engagement (Resend).** T-7, T-3, T-1 trial reminders; weekly student-pattern digest for parents; class-level pattern digest for teachers. UI implications: opt-in/opt-out controls in settings; possibly an "email preview" surface.

### Phase 2 (months 4–6)

11. **Batch upload for teachers.** One drag-and-drop, many students' papers, engine fans out. UX challenge: progress visibility, partial-failure handling, naming/matching uploads to students.

12. **Cohort pulse.** Class-level pattern detection — "your 3rd-period algebra class has a sign-distribution problem." Likely a class-detail page module.

13. **Intervention library + matching.** Pattern → intervention recommendation. Currently `interventions` table is in schema but empty. UI: a per-pattern intervention card; a teacher-facing "send this to the student/parent" workflow.

14. **Stakeholder communication layer.** Same diagnosis, different render: parent summary email, student-facing simplified version, teacher analytic view. UX challenge: same data, three audiences, one source of truth.

### Phase 3 (months 7–12)

15. Admin dashboards, LMS integrations, district-tier surfaces. Out of scope for the current wireframing pass.

---

## 7. Constraints designs must respect

### Stack (fixed; do not propose alternatives)
- **Next.js 16 App Router**, **React 19**, **TypeScript strict**.
- **Tailwind 4** with CSS-based `@theme` config. Tokens already in `apps/web/app/globals.css`.
- **shadcn/ui** primitives (already installed: Button, Card, Badge, Alert, Avatar, Dialog, DropdownMenu, Separator, Skeleton, Sonner). Add others from the shadcn catalog as needed; don't introduce a competing component library.
- **Clerk** for auth UI. Sign-in / sign-up are Clerk hosted components themed via `appearance` prop — don't redesign the auth forms from scratch.
- **Lucide icons** are not yet installed but are the expected default if/when icons enter the system.
- **No CSS-in-JS, no Radix-direct, no MUI/Chakra/Headless UI.**

### Visual language (extend, don't replace)
Source Serif 4 + Inter; warm paper / warm near-black; pen-ink blue for action; amber for *diagnostic insight* (not generic warning); mark for genuine error/destructive. Editorial tone — confident, calm, supportive. Avoid red/green right-wrong coloring on diagnostic output; the product's whole point is that "wrong" is interesting, not shameful.

### Privacy as visible posture
Trust commitments from §1 should have at least one visible home post-signup. Think: a "your data" panel in settings, a per-student consent indicator, a footer trust band on chrome pages.

### Dual audience
Every surface must work for **both** parents and teachers. Role-branched copy and prominence is fine (and already in use in `<AssessmentUploadForm>` and `<TrialBanner>`); role-locked surfaces are not, except where the data model genuinely diverges (e.g., classes are teacher-only).

### Mobile
Parent-mode signups will frequently happen on phones (kid handed mom a quiz; mom photographs it). The upload flow especially must work on a 375-wide viewport. Teachers are more likely to be on laptops but mobile-friendly is the safer assumption.

### Accessibility
WCAG AA is the informal target. The editorial palette has been chosen with contrast in mind, but new surfaces should be designed with focus-visible rings in mind, not as an afterthought. No color-only signaling (the amber "insight" treatment must also carry a label or icon).

### Scope gates (do not design implementation-ready)
The following are aspirational/roadmap only — sketch them if useful for context, but they are not the focus of this design pass:
- Cohort pulse, admin dashboards, LMS integrations (Phase 2/3).
- District-tier views.
- Student-facing simplified output (until the stakeholder communication layer spec lands).

---

## 8. Specific UX questions design should answer

Ranked by what's most blocking. Treat these as the brief for the wireframe pass.

1. **What does `/students/[id]` look like?** This is the single most valuable unbuilt surface. Header, recent activity, pattern timeline, CTAs.
2. **How does the diagnosis page narrate, not list?** Aggregate insight → per-pattern grouping → per-problem detail. What's the right hierarchy?
3. **What's the navigation primitive?** Top-bar tabs vs. left-rail vs. compact header dropdown. Role-aware behavior.
4. **What's the right empty/first-run experience for both audiences?** Parents land with zero students, zero assessments. Teachers land with zero students, zero classes, zero keys.
5. **How does inline correction feel on the diagnosis page?** Quiet pencil-edit moments vs. modal corrections.
6. **How and where does the privacy/trust posture live in-product?**
7. **Does the `with_key` mode want a side-by-side viewer?** Or a tab toggle? Or just a link to the key?
8. **What's the dashboard for, once `/students/[id]` exists?** Cross-student patterns? Recent activity feed? "Things you should look at"?

---

## 9. Live URLs and how to view it

### Local dev

```bash
docker compose up -d db
pnpm db:migrate
pnpm dev
```

| URL | Renders |
|---|---|
| `http://localhost:3000/` | Landing |
| `http://localhost:3000/sign-up/parent` | Parent signup |
| `http://localhost:3000/sign-up/teacher` | Teacher signup |
| `http://localhost:3000/dashboard` | Auth-gated; main entry post-login |
| `http://localhost:3000/upload` | Upload flow |
| `http://localhost:3000/students` | Roster |
| `http://localhost:3000/assessments/[id]` | Detail / diagnosis |
| `http://localhost:3000/settings/billing` | Billing |
| `http://localhost:3000/paywall` | Entitlement gate |

### Deployment
Railway US region. Web URL not in repo — ask david@rubberduckyinteractive.com.

### Reference HTML mocks (canonical visual language)
- `docs/Grade Sight Foundation.html`
- `docs/Grade Sight Diagnostic Reveal.html`
- `docs/Grade Sight Billing.html`
- `docs/Grade Sight Handoff.html`

---

**End of brief.** When wireframes return, drop them into `docs/superpowers/specs/` (one per surface, dated, with the same naming convention as existing specs) and I'll work through them in implementation passes.
