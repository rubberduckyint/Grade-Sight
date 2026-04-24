# Infrastructure

Grade-Sight deploys to [Railway](https://railway.app/) in the **us-west2** region.
Three services: `web`, `api`, and Railway's managed `Postgres`. Each service is
deployed independently from this same repo; they communicate over HTTP and via
`DATABASE_URL` env reference.

## Services

| Service | Source | Builder | Root Directory | Healthcheck | Runtime port |
|---|---|---|---|---|---|
| `web` | `apps/web` | Railpack (default) | `/` (repo root) | `/` | `$PORT` |
| `api` | `apps/api` | Dockerfile (`apps/api/Dockerfile`) | `apps/api` | `/api/health` | `$PORT` |
| `Postgres` | Railway template | Managed | — | — | 5432 |

## Railway config precedence — important

Railway merges config from multiple places. **Committed `railway.json` wins.**
Precedence high-to-low:

1. `railway.json` at the **Root Directory** of a service
2. UI settings (Settings → Build / Settings → Deploy)
3. Dockerfile metadata (`CMD`, `EXPOSE`)

Consequence: if a value in `railway.json` conflicts with what you set in the UI,
the UI value is silently ignored. If you're debugging a "my UI change didn't
take effect" issue, check the committed `railway.json` first.

Keep `railway.json` files **minimal** — only policy-type fields (healthcheck
path, restart policy, replicas, region). Don't put `startCommand` or
`buildCommand` in `railway.json` if you want the Dockerfile or UI to own those.

Current committed `railway.json` files:

- `apps/web/railway.json` — was created during Spec 1 scaffolding. Railway
  currently **ignores** it (`skipping 'railway.json' at 'apps/web/railway.json'
  as it is not rooted at a valid path`) because web's Root Directory is `/`.
  Kept for local documentation only.
- `apps/api/railway.json` — **is** read (Root Directory is `apps/api`). Holds
  only healthcheck path and restart policy. Commands come from the Dockerfile.

## First-time project setup

1. **Create Railway project** named Grade-Sight.
2. **Add Postgres first** — Railway's managed template (Database → Add
   PostgreSQL). Wait for it to provision.
3. **Add `web` service**: connect GitHub `rubberduckyint/Grade-Sight`, set
   **Root Directory** = `/`. Region: us-west2.
4. **Add `api` service**: same repo, **Root Directory** = `apps/api`. Region:
   us-west2.
5. **Generate public domains** (Settings → Networking → Generate Domain) for
   both `web` and `api`. Note the URLs.
6. **Configure env vars** — see per-service sections below.
7. **Apply initial migration** to Postgres — see "Migrations" below.

## `web` service config

- **Root Directory**: `/` (repo root — needed so Railpack sees
  `pnpm-workspace.yaml` and resolves workspace deps).
- **Builder**: Railpack (default).
- **Build Command** (in UI): `pnpm install --frozen-lockfile && pnpm --filter web... build`
- **Start Command** (in UI): `pnpm --filter web start`
- **Healthcheck Path**: `/`
- **Watch Paths**:
  ```
  apps/web/**
  packages/shared/**
  pnpm-lock.yaml
  pnpm-workspace.yaml
  package.json
  turbo.json
  tsconfig.base.json
  .nvmrc
  ```
- **Variables**:
  | Key | Value | Notes |
  |---|---|---|
  | `NEXT_PUBLIC_API_URL` | api's public URL | set after api deploys |

## `api` service config

- **Root Directory**: `apps/api` (Dockerfile lives there; api doesn't consume
  workspace packages so this is safe).
- **Builder**: Dockerfile (not Railpack — Railpack's Python detection is flaky
  for a Node-looking workspace-stub `package.json` alongside `pyproject.toml`).
- **Build Command** (UI): **empty** — Dockerfile owns the build.
- **Start Command** (UI): **empty** — Dockerfile's `CMD` runs `/app/start.sh`.
- **Healthcheck Path**: `/api/health`
- **Watch Paths**:
  ```
  apps/api/**
  pnpm-lock.yaml
  pnpm-workspace.yaml
  package.json
  .python-version
  ```
- **Variables**:
  | Key | Value | Notes |
  |---|---|---|
  | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway variable reference |
  | `CORS_ORIGIN` | web's public URL | so the browser can call api |
  | `LOG_LEVEL` | `info` | |
  | `ENVIRONMENT` | `production` | |

  Railway's `${{Postgres.DATABASE_URL}}` resolves to `postgresql://...`
  (without the async driver prefix). Our app normalizes it to
  `postgresql+asyncpg://...` at runtime via `asyncpg_url()` in
  `apps/api/src/grade_sight_api/db/session.py`.

## Postgres

- Provisioned via Railway's PostgreSQL template (currently Postgres 16).
- Not reached from outside Railway except via the **public** connection string
  (`DATABASE_PUBLIC_URL` in the Postgres service's Variables tab) — used for
  manual migrations from a developer laptop.
- Internal connection (used by api): `DATABASE_URL` via Railway variable
  reference. Private network only.

## Why these choices

### Why Root Directory = `/` for web

Setting Root Directory to `apps/web` copies only that subtree into the build
container. pnpm workspace deps (`@grade-sight/shared` via `workspace:*`) then
fail to resolve because `pnpm-workspace.yaml` and `packages/shared/` aren't in
the container. Root Directory = `/` copies the full repo, and our Build Command
uses `pnpm --filter web... build` to build just web plus its workspace deps.

### Why Root Directory = `apps/api` for api

api is self-contained (no workspace deps — the `apps/api/package.json` is a
workspace stub for turbo task orchestration only). Root Directory = `apps/api`
narrows the Docker build context to just api's files, which is fine and faster.

### Why Dockerfile for api but not web

Railpack is Railway's default builder and auto-detects language + package
manager. For web (pure Node + pnpm workspace) it works cleanly. For api
(Python + pyproject + a Node workspace-stub `package.json`) Railpack kept
misdetecting the stack and failing in subtle ways. A Dockerfile gives us
explicit control: `python:3.12-slim`, curl-install uv, `uv sync`, run via
`start.sh`.

### Why `start.sh` for api

Railway's container runtime doesn't reliably shell-expand `${PORT}` inside a
Dockerfile `CMD ["sh", "-c", "... $PORT"]`. Moving the actual startup into a
proper shell script file (`apps/api/start.sh`) means the expansion happens in
a real shell, not whatever entrypoint wrapper Railway uses. Script is
`chmod +x` and invoked as `CMD ["/app/start.sh"]`.

## Migrations

Applying schema changes to production Postgres is **manual** in Phase 1.
Automation (pre-deploy hooks, migration jobs, CI) is deferred until migrations
become routine.

### Manual procedure

```bash
# 1. Copy DATABASE_PUBLIC_URL from Railway's Postgres service → Variables tab
# 2. Convert to asyncpg scheme (replace `postgresql://` with `postgresql+asyncpg://`)
# 3. Run from repo root
cd /path/to/Grade-Sight
DATABASE_URL="postgresql+asyncpg://postgres:<pwd>@<host>.proxy.rlwy.net:<port>/railway" pnpm db:migrate
```

Expected output: `Running upgrade -> <rev>, <message>`. If already at head,
Alembic prints only the context messages and exits clean.

Verify afterward:
```bash
curl https://<api-url>/api/db-health
# {"status":"ok","latency_ms":<N>}
```

## Deployment cadence

Railway redeploys automatically on pushes to `main` **if** the push changes a
file matching the service's Watch Paths. No CI gating yet. Steps to test a
deploy without merging to main:

1. Push to a branch
2. In Railway, temporarily point the service's branch to your branch
3. Trigger a deploy, check logs
4. Revert the branch setting when done

A proper CI setup (GitHub Actions for typecheck/lint/build/test, then
Railway-via-branch-protection) is a later-phase concern.

## Common gotchas (we hit most of these during Spec 1 + 2)

- **Committed `railway.json` overrides the UI silently.** If a UI change isn't
  taking effect, grep the committed file.
- **Railway's Railpack copies ONLY the Root Directory.** For pnpm workspace
  builds, Root Directory = `/` is required.
- **`${{Postgres.DATABASE_URL}}` resolves to the non-async scheme.** Either
  normalize in application code (our approach) or hardcode the asyncpg URL.
- **Railpack auto-detection fights Node+Python monorepos.** A workspace-stub
  `package.json` in a Python app directory will make Railpack pick Node.
  Use a Dockerfile.
- **Inline `$PORT` in a Dockerfile CMD may not expand.** Use a script file.
- **`DATABASE_PUBLIC_URL` vs `DATABASE_URL`:** public is the proxy URL for use
  from your laptop; the private one only works inside Railway's network.
