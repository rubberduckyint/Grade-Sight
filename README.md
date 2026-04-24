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

## Clerk authentication (local dev)

Grade-Sight uses [Clerk](https://clerk.com) for authentication. To test sign-up
flows locally:

1. Sign up at https://clerk.com and create a new application. Pick "Email +
   Password" (and any OAuth providers you want) as the sign-in methods.
2. In the Clerk dashboard, enable the **Organizations** feature for the
   application. Teacher sign-ups auto-create orgs on first request.
3. Copy the **Development instance** keys:
   - `Publishable Key` (starts with `pk_test_`)
   - `Secret Key` (starts with `sk_test_`)
4. Paste them into both local env files (both files are gitignored):

```bash
# apps/web/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# apps/api/.env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

5. Restart `pnpm dev` so the new env vars load.
6. Visit http://localhost:3000 and click either "Sign up as parent" or "Sign
   up as teacher". Clerk's sign-up flow runs. On completion you land on
   `/dashboard` showing "Logged in as {name} ({role})".

Production Clerk instance (required before deploying to Railway with real
users) uses `pk_live_` / `sk_live_` keys and requires a verified domain.
Set those in Railway's Variables tab per service.

## Stripe billing (local dev)

Grade-Sight uses Stripe for subscription billing. To test the billing flow
locally:

1. Sign up at https://stripe.com and create a new account.
2. In the Stripe dashboard (Test mode), create two Products:
   - **Parent Plan** with a recurring **$15/month** price
   - **Teacher Plan** with a recurring **$25/month** price
3. Record the **price IDs** (e.g. `price_1Nxxxxx`) from each product.
4. Grab your Stripe keys (Developers → API Keys):
   - Publishable Key (`pk_test_...`)
   - Secret Key (`sk_test_...`)
5. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` then `stripe login`.
6. In one terminal, forward webhooks to your local api:

```bash
stripe listen --forward-to localhost:8000/api/webhooks/stripe
```

   Stripe CLI prints a webhook signing secret (`whsec_...`); use it as
   `STRIPE_WEBHOOK_SECRET` locally.

7. Fill in `apps/api/.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PARENT_MONTHLY=price_...
STRIPE_PRICE_TEACHER_MONTHLY=price_...
```

8. Fill in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

9. Restart `pnpm dev`.
10. Sign up (parent or teacher) via the normal Clerk flow. On first
    authenticated request, a Stripe customer and trialing subscription
    row are auto-created. Check Stripe Dashboard → Customers to verify.
11. To test adding a card: click "Add card" on the dashboard trial banner
    OR go to `/settings/billing` → "Manage billing". Use Stripe test
    cards:
    - Success: `4242 4242 4242 4242`
    - Decline: `4000 0000 0000 0002`
    - Insufficient funds: `4000 0000 0000 9995`

For production deploy: create a Live-mode Stripe instance, register the
webhook endpoint (`https://<api-url>/api/webhooks/stripe`), and swap
Railway's Stripe env vars to `pk_live_...` / `sk_live_...`.

## Deployment

See `infra/README.md` for Railway setup. Two services (`web`, `api`), US region,
independent deploys.

## Contributing

This repo is developed in tight collaboration with Claude Code. Before starting
any feature work, review `CLAUDE.md` for the active scope gates and working
agreements.
