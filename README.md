# Grade-Sight

Diagnostic grading platform for secondary math — identifies *why* students lose
points via a four-category error taxonomy, with longitudinal tracking per
student.

See `docs/PROJECT_BRIEF.md` for the product thesis, `CLAUDE.md` for durable
project rules (auto-loaded by Claude Code), and `docs/superpowers/specs/` for
design specs.

## Repo layout

```
apps/
  web/        Next.js 14+ (App Router) + Tailwind + shadcn/ui
  api/        Python FastAPI
packages/
  shared/     TypeScript types shared across JS apps
infra/        Deployment docs (Railway)
docs/         Product brief, design specs, implementation plans
```

## Prerequisites

- **Node** 20+ (`node --version`)
- **pnpm** 9+ (`pnpm --version`). Install via `npm install -g pnpm@9`.
- **Python** 3.12+ (`python3.12 --version`)
- **uv** 0.5+ (`uv --version`). Install via `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- **Docker** (for local Postgres). Docker Desktop or Docker Engine + Compose v2.

Ensure `uv` is on your shell PATH. The uv installer typically adds a line to
your shell config; if `which uv` fails after install, add
`. "$HOME/.local/bin/env"` to `~/.zshenv` (or equivalent for your shell).

## Install

```bash
pnpm install
```

This runs `uv sync` in `apps/api` automatically via a `postinstall` hook, so a
single command bootstraps both ecosystems.

## Dev

```bash
pnpm dev
```

Starts both apps in one terminal:

- `apps/web` on <http://localhost:3000>
- `apps/api` on <http://localhost:8000> (health: <http://localhost:8000/api/health>)

## Local Postgres

Bring up Postgres 16 in the background:

```bash
docker compose up -d db
```

Apply migrations:

```bash
pnpm db:migrate
```

Stop:

```bash
docker compose down
```

To wipe the local DB (reset to clean state):

```bash
docker compose down -v
```

## Migrations

```bash
pnpm db:migrate              # alembic upgrade head
pnpm db:makemigration -- "your message"   # autogenerate a new migration
pnpm db:rollback             # alembic downgrade -1
```

**Production migrations** are currently manual. To apply a new migration to
Railway's Postgres, set `DATABASE_URL` locally to Railway's
`DATABASE_PUBLIC_URL` and run `pnpm db:migrate`. See `infra/README.md`
for how to find the public URL.

## Other commands

```bash
pnpm build        # Build all workspaces (packages/shared, apps/web, apps/api)
pnpm typecheck    # tsc --noEmit across JS; mypy strict on apps/api
pnpm lint         # ESLint on JS; Ruff on apps/api
pnpm format       # Prettier on JS; Ruff format on apps/api
pnpm test         # Vitest + pytest harnesses (no tests in Spec 1 — exits 0)
```

## Environment variables

Each app has its own `.env.example` with required + forward-looking (commented)
keys. Copy to `.env.local` (web) or `.env` (api) for local dev:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

`.env` and `.env.local` are gitignored; never commit secrets.

## Deployment

See `infra/README.md` for Railway setup. Two services (`web`, `api`), US region,
independent deploys.

## Contributing

This repo is developed in tight collaboration with Claude Code. Before starting
any feature work, review `CLAUDE.md` for the active scope gates and working
agreements.
