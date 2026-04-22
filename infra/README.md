# Infrastructure

Grade-Sight deploys to [Railway](https://railway.app/), US region, pinned. Each
app in `apps/` is a separate Railway service.

## Services

| Service | Source directory | Healthcheck | Port (runtime) |
|---|---|---|---|
| `web` | `apps/web` | `/` | `$PORT` |
| `api` | `apps/api` | `/api/health` | `$PORT` |

Each service's build + deploy config is set **in the Railway UI** (Settings →
Build + Deploy). The `apps/<name>/railway.json` files duplicate that config for
local reference, but Railway treats the UI settings as authoritative. If you
change a command, change it in both places to keep them in sync.

Railway's default builder is **Railpack**. Leave it as the default; Nixpacks is
deprecated.

## Setting up Railway (manual, first time)

1. Create a Railway project for Grade-Sight.
2. Add a service called `web`: connect this GitHub repo, set **Root Directory**
   to `apps/web`.
3. Add a service called `api`: same repo, **Root Directory** = `apps/api`.
4. For both services, set **Region** to a US region (e.g. `us-west`). UI-only.
5. In each service's **Settings → Build + Deploy**, set:

   **`web` service:**
   - Build Command: `pnpm install --frozen-lockfile && pnpm --filter web... build`
   - Start Command: `pnpm --filter web start`
   - Healthcheck Path: `/`

   **`api` service:**
   - Build Command: `uv sync --locked`
   - Start Command: `uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port $PORT`
   - Healthcheck Path: `/api/health`

6. Configure environment variables in each service's **Variables** tab. See
   `apps/web/.env.example` and `apps/api/.env.example` for the required keys
   (Spec 1 requires only `NEXT_PUBLIC_API_URL` on web; `API_PORT`, `CORS_ORIGIN`,
   `LOG_LEVEL`, `ENVIRONMENT` on api).
7. On the web service, set `NEXT_PUBLIC_API_URL` to the api service's public
   URL (Railway shows it once the service has deployed once).

## Adding Postgres (Spec 2, not yet)

When Spec 2 lands:
1. Add a Railway-managed Postgres instance in the same project.
2. Reference its connection string from the api service as `DATABASE_URL`
   (Railway sets this automatically when you link the DB to the service).

## No deploys happen automatically

CI/CD is deferred until a later spec. For now, Railway builds on git push to
the configured branch, but no protected main-branch gating is wired up.
