# Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the three-layer memory system defined in `docs/superpowers/specs/2026-04-21-memory-system-design.md` — CLAUDE.md in the repo, user memory in the private folder, and a reconciled memory index — so future sessions open with durable project context.

**Architecture:** Repo-level `CLAUDE.md` holds project rules, stack, scope gates, privacy commitments, and working agreements (auto-loaded every session, git-tracked). Private memory folder at `~/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/` holds user-specific preferences, feedback, and references (auto-loaded via `MEMORY.md` index, not git-tracked). `docs/` holds long-form rationale and design specs (read on demand, referenced from CLAUDE.md).

**Tech Stack:** Markdown. No code, no tests, no build step. Verification is user approval of drafted content.

---

## Task 1: Draft and commit CLAUDE.md

**Files:**
- Create: `/Users/exexporerporer/Projects/Grade-Sight/CLAUDE.md`
- Reference (read-only): `/Users/exexporerporer/Projects/Grade-Sight/docs/PROJECT_BRIEF.md`, `/Users/exexporerporer/Projects/Grade-Sight/docs/CLAUDE_CODE_KICKOFF.md`, `/Users/exexporerporer/Projects/Grade-Sight/docs/superpowers/specs/2026-04-21-memory-system-design.md`

- [ ] **Step 1: Re-read the source docs**

Read the three reference files above to pull the exact content for each CLAUDE.md section. The content mapping is in the spec under "Day-One Content Plan → CLAUDE.md — source mapping."

- [ ] **Step 2: Draft CLAUDE.md — sections 1–3**

Write the file with these three sections first. Target lengths are guidance, not hard limits.

```markdown
# Grade-Sight — Project Rules for Claude Code

This file is auto-loaded at the start of every Claude Code session. It captures the rules and context that do not change between sessions. For long-form rationale, see `docs/PROJECT_BRIEF.md`. For design specs, see `docs/superpowers/specs/`. For user-specific preferences and feedback, see the private memory index at `~/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`.

## 1. Identity & current phase

Grade-Sight is a diagnostic grading platform for secondary math (Algebra → Pre-Calc, CA Common Core). Core differentiator: identifies *why* students lose points via a four-category error taxonomy (conceptual, execution, verification, confidence/strategy), with longitudinal tracking per student. Dual GTM from MVP: parent mode (primary early traction) and individual teacher mode (bottoms-up SaaS wedge). District sales deferred to Phase 3.

**Current phase:** Phase 1 MVP — foundational scaffolding not yet started. Planning docs committed; memory system being put in place before scaffolding.

## 2. Tech stack (fixed)

- **Frontend:** Next.js 14+ (App Router) + Tailwind + shadcn/ui, TypeScript strict
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
```

- [ ] **Step 3: Draft CLAUDE.md — sections 4–7**

Append these sections.

```markdown
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
```

- [ ] **Step 4: Verify line count and structure**

Run: `wc -l /Users/exexporerporer/Projects/Grade-Sight/CLAUDE.md`
Expected: ~100–140 lines. If significantly longer, tighten section 3 or 4.

Verify headers exist in order:
Run: `grep '^## ' /Users/exexporerporer/Projects/Grade-Sight/CLAUDE.md`
Expected output (7 lines in order):
```
## 1. Identity & current phase
## 2. Tech stack (fixed)
## 3. Architectural non-negotiables
## 4. Privacy hard commitments (must not be violated)
## 5. Do NOT yet (active scope gates)
## 6. Working agreements
## 7. Where to find things
```

- [ ] **Step 5: Present full CLAUDE.md to the user for approval**

Ask: "CLAUDE.md draft is at `/Users/exexporerporer/Projects/Grade-Sight/CLAUDE.md`. Please read it end-to-end and tell me what to change before I commit. I'm looking for (a) anything factually wrong, (b) rules you disagree with, (c) anything missing that belongs in a durable-rules doc, (d) anything here that's *not* a durable rule and should move to memory or the brief."

Wait for response. Do not proceed to commit until explicit approval.

- [ ] **Step 6: Apply any user edits**

If the user requests edits, apply them with Edit, then re-present for approval. Loop until approved.

- [ ] **Step 7: Commit CLAUDE.md**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add CLAUDE.md
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add CLAUDE.md — durable project rules for Grade-Sight

Auto-loaded at session start. Covers identity and current phase,
tech stack, architectural non-negotiables, privacy hard commitments,
active scope gates, working agreements, and pointers to long-form
docs and private memory. Per the memory system design spec at
docs/superpowers/specs/2026-04-21-memory-system-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Run: `git -C /Users/exexporerporer/Projects/Grade-Sight log --oneline -1`
Expected: the new commit at HEAD.

---

## Task 2: Seed the private user memory

**Files:**
- Create: `/Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/user_role.md`
- Modify: `/Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`

- [ ] **Step 1: Write user_role.md**

Use the Write tool to create the file with this content:

```markdown
---
name: User role and identity
description: Who David is and how that shapes collaboration on Grade-Sight
type: user
---

David is the founder of Rubber Ducky Interactive (GitHub org: `rubberduckyint`) and the owner/operator of the Grade-Sight project. Email: david@rubberduckyinteractive.com.

Grade-Sight is being built as a product, not a personal project — treat design, cost, and compliance decisions through a product-owner lens. Dual GTM audience is parent mode + individual teacher mode, with district sales deferred.

**How to apply:**
- Frame explanations at the level of a technical founder who is making product/architecture trade-offs, not at a tutorial level.
- When presenting options, lead with a recommendation and the relevant trade-off so David can redirect fast. Don't bury the call.
- Product/compliance decisions take priority over ergonomic-code arguments when they conflict (see privacy hard commitments in CLAUDE.md).
```

- [ ] **Step 2: Update MEMORY.md index**

Read the current MEMORY.md:
Run: Read `/Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`

Add a new line so the index contains both entries. After the edit the file should read:

```markdown
- [Project overview](project_overview.md) — Grade-Sight / EduSupport: diagnostic math grading platform, Next.js + FastAPI, privacy-first, Phase 1 MVP scope
- [User role and identity](user_role.md) — David, founder of Rubber Ducky Interactive; product-owner framing for all collaboration
```

(The project_overview line may be removed or rewritten in Task 3 — don't change it now.)

- [ ] **Step 3: Verify memory folder contents**

Run: `ls -la /Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/`
Expected: `MEMORY.md`, `project_overview.md`, `user_role.md` all present.

No commit — this folder is not git-tracked.

---

## Task 3: Reconcile project_overview.md against the new CLAUDE.md

**Files:**
- Modify or delete: `/Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/project_overview.md`
- Modify (if step 3 removes the file): `/Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`

- [ ] **Step 1: Diff project_overview.md against CLAUDE.md**

Read both files. Identify, for each fact in `project_overview.md`, whether it is now also in CLAUDE.md.

Expected outcome: every substantive fact in `project_overview.md` (product thesis, stack, architectural non-negotiables, MVP scope, canonical docs) is now duplicated in CLAUDE.md. If so, the file is fully redundant.

- [ ] **Step 2: Decide: retire, trim, or keep**

Apply this rule from the spec (Day-One Content Plan → Private memory):
- *"Content that duplicates CLAUDE.md is removed from the memory file; anything uniquely private (e.g., user-specific context) stays."*

If `project_overview.md` contains **only** content now in CLAUDE.md → retire (delete the file).
If it contains **some** private-only content → trim to just the private parts.
If it contains **no** duplicates → keep as-is (unlikely given current state).

- [ ] **Step 3: Apply the decision**

If retiring: delete the file.
Run: `rm /Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/project_overview.md`

If trimming: use Edit to reduce the file to only the private-specific content. Update frontmatter `description` to match the narrower scope.

If keeping: no action.

- [ ] **Step 4: Update MEMORY.md index to match**

If the file was retired, remove its line from MEMORY.md:
```markdown
- [User role and identity](user_role.md) — David, founder of Rubber Ducky Interactive; product-owner framing for all collaboration
```

If trimmed, update the one-line hook in MEMORY.md to reflect the narrower scope.

If kept, no change.

- [ ] **Step 5: Verify final memory folder state**

Run: `ls /Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/`
Expected: `MEMORY.md`, `user_role.md`, and optionally `project_overview.md` (trimmed or kept).

Run: Read `/Users/exexporerporer/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/MEMORY.md`
Expected: every listed file exists; no orphan entries.

No commit — this folder is not git-tracked.

---

## Task 4: Push repo changes

**Files:** No new files — this task verifies and pushes Task 1's commit.

- [ ] **Step 1: Confirm repo state**

Run: `git -C /Users/exexporerporer/Projects/Grade-Sight status`
Expected: `nothing to commit, working tree clean`.

Run: `git -C /Users/exexporerporer/Projects/Grade-Sight log --oneline origin/main..HEAD`
Expected: two commits not yet pushed — the memory-system design spec (`a1ed930`) and the CLAUDE.md add from Task 1.

- [ ] **Step 2: Ask user before pushing**

Pushing is a shared-state action. Ask: "Ready to push the two unpushed commits (design spec + CLAUDE.md) to `origin/main`?"

Wait for explicit approval before continuing.

- [ ] **Step 3: Push to origin**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight push origin main
```

Expected output: `main -> main` confirmation, no errors.

- [ ] **Step 4: Verify push**

Run: `git -C /Users/exexporerporer/Projects/Grade-Sight log --oneline origin/main..HEAD`
Expected: empty output (nothing ahead of origin).

Run: `git -C /Users/exexporerporer/Projects/Grade-Sight status`
Expected: `Your branch is up to date with 'origin/main'.`

---

## Completion criteria

- `CLAUDE.md` exists at repo root with all seven sections, reviewed by the user, committed, and pushed.
- Private memory folder contains `MEMORY.md` + `user_role.md` at minimum; `project_overview.md` either retired or trimmed to unique private content.
- `MEMORY.md` index matches the actual files present — no orphan entries.
- `origin/main` includes both the design spec commit and the CLAUDE.md commit.
