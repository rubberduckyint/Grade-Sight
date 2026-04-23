# Grade-Sight — Project Rules for Claude Code

This file is auto-loaded at the start of every Claude Code session. It captures the rules and context that do not change between sessions. For long-form rationale, see `docs/PROJECT_BRIEF.md`. For design specs, see `docs/superpowers/specs/`. For user-specific preferences and feedback, see the private memory index at `~/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`.

## 1. Identity & current phase

Grade-Sight is a diagnostic grading platform for secondary math (Algebra → Pre-Calc, CA Common Core). Core differentiator: identifies *why* students lose points via a four-category error taxonomy (conceptual, execution, verification, confidence/strategy), with longitudinal tracking per student. Dual GTM from MVP: parent mode (primary early traction) and individual teacher mode (bottoms-up SaaS wedge). District sales deferred to Phase 3.

**Current phase:** Phase 1 MVP — Specs 1 (scaffolding) and 2 (DB schema + migrations) complete. Next: Spec 3 (Clerk auth integration).

## 2. Tech stack (fixed)

- **Frontend:** Next.js 16 (App Router) + Tailwind 4 + shadcn/ui, TypeScript strict
- **Backend:** Python FastAPI, mypy strict
- **Database:** Postgres (Supabase or Railway-managed)
- **Auth:** Clerk (with organizations)
- **LLM:** Anthropic Claude — Sonnet 4.6 for reasoning/vision, Haiku 4.5 for classification/output
- **Storage:** S3-compatible
- **Deployment:** Railway, US region, pinned
- **Monitoring:** Sentry
- **Email:** Resend
- **Testing:** pytest (backend), vitest (frontend)

Do not propose alternatives to these choices unless asked.

## 3. Architectural non-negotiables

**Schema day-one:**
- `organization_id` on every tenant-scoped table, nullable for parent accounts
- UUID primary keys everywhere
- `created_at`, `updated_at`, `deleted_at` (soft delete) on every table
- First-class tables: `audit_log`, `llm_call_logs`, `consent_flags` (JSONB on students)
- PII separation: names/identifiers in `students`, learning data in `student_profiles`, linked by ID

**Service layer:**
- All Claude / S3 / external API calls go through a centralized service module
- Claude calls log to `llm_call_logs` (model, tokens, cost, latency, timestamp)
- Student-data access logs to `audit_log`
- Data-minimization enforced: no PII through these layers without an explicit flag
- No scattered API calls in feature code

**Taxonomy as data:**
- Error taxonomy loaded from the database at runtime
- Never hardcoded in prompts or code

## 4. Privacy hard commitments (must not be violated)

- Never sell student data
- No advertising or behavioral profiling of students
- No third-party commercial sharing
- US-only data storage (Railway US region)
- Published subprocessor list, 30-day change notification
- 30-day deletion window on request, including backups
- Data minimization: collect only what's needed
- SDPC NDPA signable
- Student Privacy Pledge signatory
- Common Sense Privacy evaluation pursued
- Privacy policy reviewed by edtech counsel
- 72-hour incident notification

Code and design choices that would violate any of these require explicit discussion before proceeding.

## 5. Do NOT yet (active scope gates)

Until the gate is explicitly lifted here:

- Do not build diagnostic engine logic — taxonomy not finalized
- Do not wire up Claude API calls — service layer stubs only
- Do not build the assessment upload flow — schema only
- Do not build UI beyond basic layout, auth, and navigation
- Do not implement eval set infrastructure — comes after engine is wired
- Do not build batch upload, cohort pulse, admin dashboards, or LMS integrations — those are Phase 2+

## 6. Working agreements

- **Approval before risky actions.** Destructive ops (force push, reset --hard, deleting branches/files), actions visible to others (pushing code, opening PRs, posting externally), and uploads to third-party tools require explicit user approval. Don't assume prior approval extends to new contexts.
- **Verification before completion.** Do not claim work is done, fixed, or passing without running the verification and confirming the output. Evidence before assertions.
- **Brainstorm before building.** New features, components, or behavior changes go through the `superpowers:brainstorming` skill first. Don't start implementation without an approved design.
- **Commits on request only.** Do not create commits unless the user asks. If unclear, ask first.
- **Follow the scope gates.** When a task edges into a Do-NOT-yet area, pause and confirm before proceeding.
- **Use private memory for user-specific context.** Preferences, feedback, and references live in the private memory folder (see below), not in this file.

## 7. Where to find things

- **Long-form product and architecture rationale:** `docs/PROJECT_BRIEF.md`
- **Original kickoff prompt and Phase 1 intent:** `docs/CLAUDE_CODE_KICKOFF.md`
- **Design specs (per feature):** `docs/superpowers/specs/`
- **Implementation plans:** `docs/superpowers/plans/`
- **Private memory (user prefs, feedback, references):** `~/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`
- **Assets (images, etc.):** `assets/`
