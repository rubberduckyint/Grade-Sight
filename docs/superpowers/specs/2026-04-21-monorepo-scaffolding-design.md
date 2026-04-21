# Monorepo Scaffolding Design — Grade-Sight

**Status:** Approved, ready for implementation planning
**Date:** 2026-04-21
**Author:** David (with Claude Code)
**Scope:** Spec 1 of 4 decomposing `docs/CLAUDE_CODE_KICKOFF.md`. Later specs cover DB schema + migrations (Spec 2), Clerk auth integration (Spec 3), and the external service abstraction layer (Spec 4).

## Problem

The Grade-Sight repo currently contains only planning docs and CLAUDE.md. To start building, we need a hybrid JS + Python monorepo that installs, builds, runs, lints, and type-checks with one command each — a skeleton that future specs (schema, auth, services) plug into without re-litigating tooling choices. The kickoff doc specifies four top-level directories (`apps/web`, `apps/api`, `packages/shared`, `infra`) and a set of constraints (strict TypeScript, strict mypy, test scaffolding, env-var discipline, Railway deployment) but leaves tool choices (workspace manager, Python package manager, codegen strategy, dev orchestration) open. This spec pins those down.

## Goals

- One-command install covers both ecosystems on a fresh clone.
- One-command dev boots `apps/web` and `apps/api` together with hot reload.
- Strict TypeScript and strict mypy configured and passing on an empty project.
- Lint, format, typecheck, and test commands work across all packages and apps.
- `packages/shared` exists as a consumable workspace package with day-one types.
- Railway deployment configs exist per service (no actual deploy happens here).
- README documents setup, dev flow, and where env-var examples live.

## Non-Goals

- No database setup, migrations, or schema work (Spec 2).
- No auth integration — no Clerk, no protected routes, no user model (Spec 3).
- No external service abstraction, no Claude API, no S3, no audit/llm call logging (Spec 4).
- No Sentry, no Resend, no analytics wiring.
- No CI/GitHub Actions pipeline — defer until there's something worth gating.
- No shadcn/ui components beyond what the CLI `init` step produces — components land as features need them.
- No actual Railway deploy — configs only; the user connects services in Railway when ready.

## Tooling Decisions (Locked)

| Area | Choice | Rationale |
|---|---|---|
| JS package manager | **pnpm** | Strict workspace isolation, fast installs, standard for modern monorepos |
| JS task runner | **Turborepo** | Pipeline orchestration with per-task caching; earns its keep by Phase 2 |
| Python package manager | **uv (Astral)** | Fast resolution, built-in venv + lockfile, pairs with Ruff |
| JS lint | **ESLint** (`eslint-config-next` + `@typescript-eslint/strict`) | Next.js requires ESLint for `next/core-web-vitals`; Biome alone isn't sufficient |
| JS format | **Prettier** | Convention; no reason to diverge |
| Python lint + format | **Ruff** | One tool, Astral-stack consistency with uv |
| Python type check | **mypy strict** | Kickoff constraint |
| TS type check | **tsc strict** | Kickoff constraint |
| JS test | **Vitest** | Fast, ESM-native, Next.js-friendly |
| Python test | **pytest** (+ pytest-asyncio) | Kickoff constraint |
| Shared types | **Hand-written TypeScript** mirroring Pydantic | YAGNI for <10 types; promote to codegen later |
| Dev orchestration | **`pnpm dev` + `concurrently`** | Single command, one terminal, both apps |
| Deployment | **Railway per-service configs** | Aligns with the product's locked deployment target |

## Architecture

### Repo layout

```
Grade-Sight/
├── apps/
│   ├── web/
│   │   ├── app/                      # Next.js App Router
│   │   ├── components/               # shadcn/ui components land here via CLI
│   │   ├── lib/                      # app-local utilities
│   │   ├── public/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── components.json           # shadcn config
│   │   ├── railway.json
│   │   └── .env.example
│   └── api/
│       ├── src/grade_sight_api/
│       │   ├── __init__.py
│       │   ├── main.py               # FastAPI app, /api/health
│       │   ├── config.py             # Pydantic BaseSettings
│       │   └── services/             # empty for now; populated in Spec 4
│       │       └── __init__.py
│       ├── tests/
│       │   └── conftest.py           # pytest skeleton
│       ├── pyproject.toml
│       ├── uv.lock
│       ├── railway.json
│       └── .env.example
├── packages/
│   └── shared/
│       ├── src/
│       │   └── index.ts              # exports all day-one types
│       ├── package.json              # name: "@grade-sight/shared"
│       └── tsconfig.json
├── infra/
│   └── README.md                     # Railway setup notes, region pinning, env-var instructions
├── docs/                             # existing
├── assets/                           # existing
├── .github/                          # empty; CI deferred
├── CLAUDE.md                         # existing
├── README.md                         # NEW
├── package.json                      # root: workspace + turbo scripts + concurrently
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json                # shared strict TS base
├── .editorconfig
├── .gitignore                        # existing, extended if needed
├── .nvmrc                            # Node version pin
├── .python-version                   # Python version pin (uv reads this)
└── .prettierrc / .prettierignore
```

### Component boundaries

- **`apps/web`** and **`apps/api`** are independently deployable Railway services. They communicate over HTTP only; no shared runtime code. This keeps each app's deploy surface clean and mirrors the GTM target (parent app could eventually be its own service).
- **`packages/shared`** is **TypeScript-only**. It contains identifier type aliases and response shapes that `apps/web` imports. Python has its own Pydantic models in `apps/api`; the two are kept in sync by hand. Line comments in `packages/shared/src/index.ts` point to the Pydantic class each type mirrors.
- **`infra/`** holds deployment documentation. The per-service `railway.json` files live inside each app directory (not in `infra/`) because Railway auto-discovers them from the service's root directory.

### Data flow (day-one runtime)

1. Developer runs `pnpm dev` at the repo root.
2. Root script uses `concurrently` to spawn two processes:
   - `pnpm --filter web dev` (Next.js on port 3000)
   - `cd apps/api && uv run uvicorn grade_sight_api.main:app --reload --port 8000`
3. Browser requests `http://localhost:3000` → Next.js serves the placeholder landing page.
4. `GET http://localhost:8000/api/health` → FastAPI returns `{"status": "ok"}`.

No cross-service calls happen in Spec 1. The `NEXT_PUBLIC_API_URL` env var is wired but unused until a later spec needs it.

## Package Contracts

### `packages/shared` — day-one exports

```typescript
// src/index.ts

// Mirrors Pydantic class OrganizationId (apps/api/.../models.py, future)
export type OrganizationId = string & { __brand: "OrganizationId" };

// Mirrors Pydantic class StudentId
export type StudentId = string & { __brand: "StudentId" };

// Mirrors Pydantic class AssessmentId
export type AssessmentId = string & { __brand: "AssessmentId" };

// Mirrors Pydantic enum UserRole
export type UserRole = "parent" | "teacher" | "admin";

// Skeleton; full shape defined in PROJECT_BRIEF.md §Diagnostic Output Schema.
// Will be fleshed out in Spec 4 (or whichever spec first needs it).
export interface DiagnosticRecord {
  assessment_id: AssessmentId;
  student_id: StudentId;
  graded_at: string; // ISO 8601
  // Full fields deferred until the diagnostic engine work begins.
}
```

Branded string types prevent accidental mixing of ID types at compile time.

### `apps/api/src/grade_sight_api/main.py` — day-one endpoints

```python
from fastapi import FastAPI
from .config import settings

app = FastAPI(title="Grade-Sight API")

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

One endpoint. No middleware, no CORS setup yet (defer until the web app actually calls the api — probably Spec 3).

### `apps/api/src/grade_sight_api/config.py` — typed settings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    api_port: int = 8000
    cors_origin: str = "http://localhost:3000"
    log_level: str = "info"
    environment: str = "development"

settings = Settings()
```

### `apps/web/app/page.tsx` — day-one landing

Minimal placeholder — "Grade-Sight" title, "coming soon" subtitle, Tailwind-styled. Not product copy; just proof the build works.

## Environment Variables

### `apps/web/.env.example`

```
# Required
NEXT_PUBLIC_API_URL=http://localhost:8000

# Future (commented until their spec lands):
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
# CLERK_SECRET_KEY=
# NEXT_PUBLIC_SENTRY_DSN=
```

### `apps/api/.env.example`

```
# Required
API_PORT=8000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
ENVIRONMENT=development

# Future (commented until their spec lands):
# DATABASE_URL=
# CLERK_JWKS_URL=
# ANTHROPIC_API_KEY=
# SENTRY_DSN=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

### Runtime validation

- **Web:** `@t3-oss/env-nextjs` + `zod`. Defined in `apps/web/env.ts`, re-exported from `apps/web/lib/env.ts` for app-side consumption. Crashes at boot if required vars are missing or malformed.
- **API:** Pydantic `BaseSettings` in `config.py` (shown above). Same behavior on the Python side.

## Dev Orchestration

### Root `package.json` scripts

```json
{
  "scripts": {
    "install:py": "uv sync --project apps/api",
    "postinstall": "pnpm install:py",
    "dev": "concurrently -n web,api -c blue,green \"pnpm --filter web dev\" \"cd apps/api && uv run uvicorn grade_sight_api.main:app --reload --port 8000\"",
    "build": "turbo run build",
    "lint": "turbo run lint && cd apps/api && uv run ruff check",
    "format": "turbo run format && cd apps/api && uv run ruff format",
    "typecheck": "turbo run typecheck && cd apps/api && uv run mypy src",
    "test": "turbo run test && cd apps/api && uv run pytest"
  }
}
```

Notes:
- `postinstall` triggers `uv sync` so fresh clones get both ecosystems wired via a single `pnpm install`.
- `concurrently` is a root dependency. Color-prefixed output; Ctrl+C propagates.
- Python invocations use `cd apps/api && uv run ...` rather than a `pnpm --filter` equivalent because `uv` is the authoritative tool on the Python side.

### Turborepo pipeline (`turbo.json`)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": { "outputs": [] },
    "typecheck": { "outputs": [] },
    "format": { "outputs": [] },
    "test": { "outputs": [] }
  }
}
```

(Turborepo 2.x renamed `pipeline` → `tasks`.)

`^build` ensures `packages/shared` builds before `apps/web` when the web app imports from it.

## Railway Deployment Scaffolding

### `apps/web/railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter web... build"
  },
  "deploy": {
    "startCommand": "pnpm --filter web start",
    "healthcheckPath": "/",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### `apps/api/railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### `infra/README.md` contents

- Step-by-step: creating two Railway services, each pointing at the appropriate subdirectory (`apps/web`, `apps/api`).
- Env-var setup in the Railway UI (since env vars don't live in `railway.json`).
- US-region pin instructions (currently a UI-only setting).
- How to link Railway Postgres — deferred to Spec 2 but the pattern is noted.
- No actual deploy is run during Spec 1 implementation.

## Testing

No tests are authored in Spec 1 (per kickoff constraint: "Test scaffolding set up … but no tests written yet"). The verification that "scaffolding works" is the acceptance criteria below.

Test harness scaffolding:
- `apps/web` and `packages/shared`: Vitest configured via `vitest.config.ts`. A placeholder `tests/` dir exists in each.
- `apps/api`: `tests/conftest.py` skeleton. `pyproject.toml` declares pytest + pytest-asyncio as dev deps.
- `pnpm test` runs all harnesses. Expected result: zero tests, zero failures, exit 0 from both sides.

## Error Handling

Spec 1 has no runtime logic beyond the health check and config loading, so error handling is limited to:

- **Config load failure:** Both `@t3-oss/env-nextjs` on the web side and Pydantic `BaseSettings` on the api side throw at import/boot time when required vars are missing or wrong-typed. This is desired — deploys fail loudly.
- **Health check:** Returns `200 OK` unconditionally. Richer health checks (DB connectivity, etc.) come with later specs.

## Acceptance Criteria

Implementation is done when all of these are true on a fresh clone:

1. `pnpm install` succeeds. The postinstall hook runs `uv sync` and populates `apps/api/.venv/` with locked Python deps.
2. `pnpm dev` boots both apps. `localhost:3000` renders the Next.js placeholder landing page. `GET localhost:8000/api/health` returns `{"status": "ok"}`.
3. `pnpm typecheck` passes across `apps/web`, `packages/shared`, and `apps/api` (tsc strict + mypy strict).
4. `pnpm lint` passes across all packages (ESLint + Prettier check on JS side; Ruff check on Python side).
5. `pnpm build` builds `packages/shared` first, then `apps/web`, without errors.
6. `pnpm test` runs Vitest and pytest harnesses and exits 0 (no tests defined; no failures).
7. `packages/shared/src/index.ts` exports `OrganizationId`, `StudentId`, `AssessmentId`, `UserRole`, `DiagnosticRecord` with inline comments pointing at their future Pydantic counterparts.
8. `README.md` documents prerequisites, install, dev, build, typecheck, lint, test commands, and paths to `.env.example` files.
9. `.gitignore` covers `node_modules/`, `.next/`, `dist/`, `__pycache__/`, `*.py[cod]`, `.venv/`, `.env`, `.env.*` (except `.env.example`).
10. `apps/web/railway.json`, `apps/api/railway.json`, and `infra/README.md` exist with the content specified above.

## Out of Scope / Future Considerations

Explicitly deferred and called out so future specs can pick them up:

- **CI/GitHub Actions** — run install, typecheck, lint, test on PRs. Add when there's protected behavior worth gating (likely after Spec 3).
- **Remote Turbo cache** — speeds up CI once CI exists. Not needed locally.
- **Type codegen** (`packages/shared` generated from Pydantic) — promote when the type surface grows past ~20 types or drift appears.
- **Docker Compose for local Postgres** — arrives with Spec 2.
- **Commit hooks (Husky + lint-staged or pre-commit)** — possibly in Spec 3 once there's meaningful code volume.
- **shadcn/ui component library population** — components arrive with the features that use them.
- **Observability** (Sentry wiring) — arrives with the first feature that benefits from it.
- **Version pinning of packages beyond major** — use caret ranges by default, pin tight only if a bug forces it.

## Implementation Overview

(Detailed in a subsequent implementation plan via the `writing-plans` skill.)

Rough shape:
1. Root config: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.python-version`, Prettier + EditorConfig.
2. `apps/web`: Next.js 14 app with Tailwind + shadcn `init`, ESLint + Prettier configs, Vitest config, placeholder landing page, `env.ts` typed config, `railway.json`, `.env.example`.
3. `apps/api`: uv-managed FastAPI app with Ruff + mypy + pytest configs, `main.py` with `/api/health`, `config.py` with typed settings, `railway.json`, `.env.example`.
4. `packages/shared`: TypeScript package with day-one types and `tsconfig.json` extending the base.
5. `infra/README.md`: Railway setup notes.
6. Root `README.md`: prerequisites, install, dev, build, test, env var pointers.
7. `.gitignore` extensions for the new artifacts.
8. Final acceptance run — every command in the criteria list verified manually before commit.
