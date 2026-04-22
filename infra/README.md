# Infrastructure

Grade-Sight deploys to [Railway](https://railway.app/), US region, pinned. Each
app in `apps/` is a separate Railway service.

## Services

| Service | Source directory | Healthcheck | Port (runtime) |
|---|---|---|---|
| `web` | `apps/web` | `/` | `$PORT` |
| `api` | `apps/api` | `/api/health` | `$PORT` |

Each service reads its build + deploy config from `apps/<name>/railway.json`.

## Setting up Railway (manual, first time)

1. Create a Railway project for Grade-Sight.
2. Add a service called `web`, connect this GitHub repo, set **Root Directory**
   to `apps/web`. Railway picks up `apps/web/railway.json` automatically.
3. Add a service called `api`, same repo, set **Root Directory** to `apps/api`.
4. For both services, set **Region** to a US region (e.g. `us-west`). This is a
   UI-only setting at the time of writing — not expressible in `railway.json`.
5. Configure environment variables in each service's **Variables** tab. See
   `apps/web/.env.example` and `apps/api/.env.example` for the required keys
   (Spec 1 requires only `NEXT_PUBLIC_API_URL` on web; `API_PORT`, `CORS_ORIGIN`,
   `LOG_LEVEL`, `ENVIRONMENT` on api).
6. On the web service, set `NEXT_PUBLIC_API_URL` to the api service's public
   URL (Railway shows it once the service has deployed once).

## Adding Postgres (Spec 2, not yet)

When Spec 2 lands:
1. Add a Railway-managed Postgres instance in the same project.
2. Reference its connection string from the api service as `DATABASE_URL`
   (Railway sets this automatically when you link the DB to the service).

## No deploys happen automatically

CI/CD is deferred until a later spec. For now, Railway builds on git push to
the configured branch, but no protected main-branch gating is wired up.
