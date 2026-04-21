# Memory System Design — Grade-Sight

**Status:** Approved, ready for implementation planning
**Date:** 2026-04-21
**Author:** David (with Claude Code)

## Problem

A new Claude Code session on Grade-Sight starts with no knowledge of prior decisions, current phase, scope gates, or working-style preferences. Without durable context, each session re-litigates settled decisions, drifts from the kickoff scope, or needs the user to re-brief it. The two existing planning docs (`docs/PROJECT_BRIEF.md`, `docs/CLAUDE_CODE_KICKOFF.md`) capture decisions but aren't auto-loaded and mix long-form rationale with immediately-actionable rules.

## Goals

- Future sessions open with the project's fixed rules, current phase, and scope gates already in context.
- Preferences and feedback about how the user wants to collaborate persist across sessions without being git-tracked or visible to collaborators.
- The system distinguishes *what must not change* from *where we currently are* from *how we're working together*.
- Low maintenance overhead — updates happen surgically when a durable fact changes, not on every session.

## Non-Goals

- No automation to auto-summarize sessions (deferred; revisit if drift persists).
- No project-level `.claude/skills/` or custom SessionStart hooks on day one (YAGNI).
- No migration of long-form brief content into CLAUDE.md (it's the wrong surface).
- No syncing or mirroring between the private memory folder and the repo.

## Architecture

Three layers, separated by what they hold and who can see them:

```
Repo (git-tracked, shared)              Private (user's machine only)
─────────────────────────                ─────────────────────────────
CLAUDE.md           ← auto-loaded        ~/.claude/projects/
   │                every session          -Users-exexporerporer-
   │ points to                             Projects-Grade-Sight/memory/
   ▼                                          │
docs/                                         ├── MEMORY.md  ← auto-loaded
   ├── PROJECT_BRIEF.md   (long ref)          │              (index)
   ├── CLAUDE_CODE_KICKOFF.md                 ├── user_*.md
   └── superpowers/                           ├── feedback_*.md
       └── specs/                             └── reference_*.md
           └── YYYY-MM-DD-*.md  (design docs)
```

**Data flow**

1. Session starts → harness auto-loads `CLAUDE.md` (repo root) and `MEMORY.md` (private index).
2. When a linked memory file or `docs/` reference becomes relevant, Claude reads it on demand.
3. When a new durable project fact or working agreement emerges, Claude proposes a CLAUDE.md edit; when a private preference or feedback emerges, Claude writes to the memory folder silently.
4. New feature specs are produced via the brainstorming skill and land in `docs/superpowers/specs/`.

**Layer boundaries**

| Layer | Holds | Git-tracked | Visible to user |
|---|---|---|---|
| `CLAUDE.md` | Rules that don't change between sessions (scope, stack, commitments, working agreements) | Yes | Yes |
| `docs/` | Rationale, long-form brief, kickoff context, design specs | Yes | Yes |
| Private memory folder | User role, preferences, feedback, references — personal and transient to this machine | No | No (unless opened manually) |

## CLAUDE.md Structure

Target length: ~120 lines. Sections in order:

1. **Identity & current phase** (~10 lines) — what Grade-Sight is, Phase 1 MVP scope, current state (updates as the project progresses).
2. **Tech stack** (~10 lines) — the fixed choices, no rationale or alternatives.
3. **Architectural non-negotiables** (~25 lines) — schema day-one fields (multi-tenancy, soft delete, audit log, LLM call logs, consent flags, PII separation), service-layer rule for all external calls, taxonomy-as-data.
4. **Privacy hard commitments** (~15 lines) — the must-not-violate list (no selling student data, no ad profiling, US-only storage, 30-day deletion, 72-hour incident notice, etc.). Excludes soft commitments and deferred items — those belong in the brief.
5. **Do-NOT-yet list** (~10 lines) — active scope gates from the kickoff (no diagnostic engine logic, no Claude API calls yet, no assessment upload flow, no eval infra, no UI beyond auth/nav). These retire as Phase 1 progresses.
6. **Working agreements** (~15 lines) — approval gates for risky actions, verification-before-completion (evidence before claiming done), brainstorming before new features, commit only when asked, pointer to MEMORY.md for user-specific preferences.
7. **Where to find things** (~10 lines) — paths to `docs/PROJECT_BRIEF.md`, `docs/CLAUDE_CODE_KICKOFF.md`, `docs/superpowers/specs/`, and the private memory index.

## Private Memory Folder Structure

Location: `~/.claude/projects/-Users-exexporerporer-Projects-Grade-Sight/memory/`

```
memory/
├── MEMORY.md                 ← one-line-per-file index, auto-loaded
├── user_role.md              ← seeded on implementation
├── feedback_*.md             ← added as working-style preferences emerge
├── reference_*.md            ← added as external systems are referenced
└── project_overview.md       ← existing file; revisited during implementation
                                 (may be trimmed or retired once CLAUDE.md is in place)
```

No pre-creation of empty feedback/reference slots. Files are created when there's actual content.

## Day-One Content Plan

### CLAUDE.md — source mapping

| CLAUDE.md section | Source | Treatment |
|---|---|---|
| Identity & phase | `PROJECT_BRIEF.md` §Product Thesis + §Phased Build Plan | Distilled to ~10 lines; add current state line |
| Tech stack | `PROJECT_BRIEF.md` §Tech Stack | Fixed choices only, no rationale |
| Architectural non-negotiables | `PROJECT_BRIEF.md` §Architectural Non-Negotiables + `CLAUDE_CODE_KICKOFF.md` constraints | Distilled to ~25 lines |
| Privacy hard commitments | `PROJECT_BRIEF.md` §Privacy & Compliance (hard-commitments list only) | Verbatim list; omit soft and deferred |
| Do-NOT-yet | `CLAUDE_CODE_KICKOFF.md` §Do NOT Do Yet | Verbatim; mark as active scope gates |
| Working agreements | New content | Approval gates, verification-before-completion, brainstorming before features, commits only on request, MEMORY.md pointer |
| Where to find things | New content | Path pointers only |

### Private memory — day one

- Review existing `project_overview.md` after CLAUDE.md is drafted. Content that duplicates CLAUDE.md is removed from the memory file; anything uniquely private (e.g., user-specific context) stays.
- Add `user_role.md` — David at Rubber Ducky Interactive, founder; expand as more role context surfaces.
- Leave feedback and reference files uncreated until there's real content for them.

## Maintenance Policy

### CLAUDE.md

Updates are surgical, always proposed to the user, never silent.

**Triggers:**
- Phase transition (MVP done → Phase 2 begins): update Identity & Phase section.
- A non-negotiable is added or retired (e.g., taxonomy finalized and loadable from DB): update Architectural Non-Negotiables.
- A "Do NOT yet" item becomes allowed: remove from scope gate list.
- A durable working agreement emerges from validated feedback: add to Working Agreements.

**Process:** Claude proposes the edit, the user approves, Claude commits with a message that explains the change.

### `docs/`

- New design specs land in `docs/superpowers/specs/` via the brainstorming skill.
- `PROJECT_BRIEF.md` is edited only when underlying decisions change (rare).
- `CLAUDE_CODE_KICKOFF.md` is historical — treat as append-only / frozen after kickoff completes.

### Private memory folder

Silent writes during a session, following the auto-memory rules.

**Triggers:**
- User feedback (correction or validated judgment call) → `feedback_*.md`.
- Something learned about user role, preferences, or knowledge → `user_*.md`.
- External system referenced (Linear, Slack, dashboards) → `reference_*.md`.

Stale memories are removed, not left to accumulate. Duplicates with CLAUDE.md get reconciled — CLAUDE.md wins for shared truth; the private file is deleted or narrowed.

### Not a trigger (explicitly)

- Day-to-day code changes — `git log` is the record.
- Conversation details — the session log is the record.
- In-flight task state — lives in the harness's TaskList, not memory.

## Out of Scope / Future Considerations

- **Project-level SessionStart hook** that prints a status line summarizing current phase and last-touched file. Consider if drift between sessions becomes noticeable despite CLAUDE.md.
- **Project-level `.claude/skills/`** (e.g., a "grade-sight-scope-check" skill that runs before any feature work to re-assert the Do-NOT-yet list). Consider if scope creep becomes a recurring issue.
- **Auto-summary at session end** — an explicit "what changed this session" entry written to memory. Consider if picking up mid-feature becomes hard.
- **Sharing private memory** — if a collaborator joins and needs the same context, we decide then whether to promote private files to the repo or duplicate.

All four are deliberately deferred. YAGNI applies until we observe the specific failure mode they would fix.

## Implementation Overview

(Detailed in a subsequent implementation plan via the `writing-plans` skill.)

Broad shape:
1. Draft CLAUDE.md per the structure and content plan above.
2. Draft `user_role.md` in the private memory folder.
3. Review `project_overview.md` against the new CLAUDE.md; trim or retire.
4. Update `MEMORY.md` index to reflect final memory file set.
5. Commit CLAUDE.md and any `docs/` additions in a single focused commit.
