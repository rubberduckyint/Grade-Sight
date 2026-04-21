# Opening Prompt for Claude Code — First Session

Copy everything below this line into Claude Code to kick off the project scaffolding.

---

I'm starting a new project called Grade-Sight — a diagnostic grading platform for secondary math. Before we write any code, please read the PROJECT_BRIEF.md file I'm about to create in the repo. It captures the architectural decisions I've already made and I want you to operate within them.

For this first session, the goal is foundational scaffolding only. Specifically:

## Setup Tasks

1. Initialize a monorepo structure:
   - `/apps/web` — Next.js 14+ frontend with App Router, Tailwind, shadcn/ui
   - `/apps/api` — Python FastAPI backend
   - `/packages/shared` — shared types/schemas between frontend and backend (TypeScript types that mirror Python Pydantic models)
   - `/infra` — Railway deployment configs, database migration scripts

2. Set up the Postgres schema with the core tables defined in PROJECT_BRIEF.md. Start with:
   - `organizations`
   - `users` (with role enum: parent, teacher, admin)
   - `students`
   - `student_profiles`
   - `classes`
   - `class_members`
   - `assessments`
   - `audit_log`
   - `consent_flags` on students (as JSONB)
   - `llm_call_logs`
   
   Design for multi-tenancy from the start: `organization_id` on every table that could belong to an org, nullable for parent accounts. Use UUIDs for primary keys. Include `created_at`, `updated_at`, `deleted_at` (for soft deletion) on every table.

3. Integrate Clerk for auth. Use their organizations feature. Parent accounts are solo (no org); teacher accounts belong to an org even if it's auto-created for that teacher initially.

4. Set up the external service abstraction layer. Any call to Claude API, S3, or external services must go through a service module. No direct API calls scattered through the code. The service layer should:
   - Log every call to `llm_call_logs` (for Claude calls)
   - Record timing, token counts, and cost
   - Enforce data minimization rules (don't send PII through these layers without explicit flag)
   - Write to `audit_log` when student data is accessed

5. Create the basic project README with setup instructions and the PROJECT_BRIEF.md as a canonical reference.

## Constraints

- Railway deployment, US region, pinned
- All external service calls logged and auditable
- Soft deletion everywhere (deleted_at timestamp); background job stub for hard deletion after retention window
- Environment variables for all secrets, never hardcoded
- TypeScript strict mode on frontend, mypy strict on backend
- Test scaffolding set up (pytest on backend, vitest on frontend) but no tests written yet

## Do NOT Do Yet

- Don't build any diagnostic engine logic — we're waiting on taxonomy finalization
- Don't wire up Claude API calls yet — just stub the service layer
- Don't build the assessment upload flow yet — schema only
- Don't build the UI beyond basic layout/auth/navigation
- Don't implement the eval set infrastructure yet — that comes after the engine is wired

## Output

At the end of this session I want:
- A working monorepo that installs and builds cleanly
- Postgres schema deployed locally via migrations
- Clerk auth working end-to-end (can sign up as parent or teacher)
- Base dashboard route that shows "logged in as [user]"
- A stubbed `/api/health` endpoint
- README with clear setup instructions
- All infrastructure in place to start building features in the next session

Please confirm you've read PROJECT_BRIEF.md, ask any clarifying questions, and then lay out your plan for this session before starting to code.
