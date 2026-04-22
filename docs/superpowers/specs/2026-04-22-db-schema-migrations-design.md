# Database Schema & Migrations Design — Grade-Sight

**Status:** Approved, ready for implementation planning
**Date:** 2026-04-22
**Author:** David (with Claude Code)
**Scope:** Spec 2 of 4 decomposing the kickoff doc. Spec 1 (monorepo scaffolding) is complete; Specs 3 (Clerk auth integration) and 4 (external service abstraction layer) depend on this one.

## Problem

The api service has no persistent storage. To start building any real feature (auth, assessment upload, diagnostic pipeline), we need a Postgres schema that embodies Grade-Sight's architectural non-negotiables from day one: multi-tenancy with nullable org_id for parent-mode users, PII separation between `students` and `student_profiles`, soft deletion on every operational table, first-class `audit_log` and `llm_call_logs`, consent flags as expandable JSONB, and UUID primary keys. The kickoff doc specifies the tables to build but leaves the toolchain, migration strategy, and connection patterns open. This spec pins those down and delivers the initial schema plus the infrastructure to evolve it safely.

## Goals

- A runnable Postgres schema with the 10 day-one tables, built and migrated via Alembic.
- Async SQLAlchemy 2.x stack with clean FastAPI dependency injection for sessions.
- Local dev story: `docker compose up -d db` + `pnpm db:migrate` gets a developer from a clean clone to a working DB.
- Production migration process documented and runnable (manually) against Railway Postgres via `DATABASE_PUBLIC_URL`.
- `GET /api/db-health` endpoint proves DB connectivity from the deployed api.
- Every subsequent spec builds on this foundation without re-litigating toolchain choices.

## Non-Goals

- No API endpoints beyond `/api/db-health` (auth-protected routes arrive in Spec 3).
- No taxonomy tables (`error_categories`, `error_patterns`, `interventions`, diagnostic_records, etc.) — gated by the "taxonomy not finalized" Do-NOT-yet rule.
- No `subprocessors` table (admin/docs feature, not MVP).
- No seed data or fixture generation — deferred.
- No tests authored — scaffolding only.
- No automated prod migration pipeline (pre-deploy hooks, migration jobs). Manual is explicit and intentional for Phase 1.
- No Row-Level Security in Postgres; multi-tenancy enforced via explicit `WHERE organization_id = ...` in queries.
- No column-level PII encryption (Railway disk-level encryption satisfies the baseline commitment; defense-in-depth deferred).

## Tooling Decisions (Locked)

| Area | Choice | Rationale |
|---|---|---|
| ORM | **SQLAlchemy 2.x** | Industry standard; async-native since 2.0; best tool for enforcing DB/API schema separation |
| Migration tool | **Alembic** | Canonical with SQLAlchemy; autogenerate diffs models to migrations |
| Execution model | **Async** (AsyncEngine, AsyncSession, asyncpg driver) | Matches FastAPI-native async; scales for future parallel LLM calls |
| Driver | **asyncpg** | Fastest async Postgres driver; pairs with SQLAlchemy async |
| Settings validation | **Pydantic v2 `BaseSettings`** with `PostgresDsn` | Already in use; boot-time URL validation |
| Local Postgres | **Docker Compose** (`postgres:16-alpine`) | Zero-install, repeatable, matches Railway's Postgres major version |
| PII at-rest | **Railway managed (disk-level) only** for Spec 2 | Meets hard commitment; column-level deferred |

## Architecture

### Directory layout

```
apps/api/
├── alembic.ini                        # Alembic config (api root, not in src)
├── alembic/
│   ├── env.py                         # async-aware Alembic env
│   ├── script.py.mako                 # migration template
│   └── versions/
│       └── 0001_initial_schema.py     # single migration: all 10 tables
├── src/grade_sight_api/
│   ├── config.py                      # extended with database_url, test_database_url
│   ├── main.py                        # lifespan hooks for engine dispose; add /api/db-health
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py                    # SQLAlchemy DeclarativeBase + shared MetaData
│   │   ├── session.py                 # AsyncEngine, async_sessionmaker, get_session dep
│   │   └── mixins.py                  # TimestampMixin, SoftDeleteMixin, TenantMixin
│   └── models/
│       ├── __init__.py                # re-exports all models (Alembic discovery)
│       ├── organization.py
│       ├── user.py
│       ├── student.py
│       ├── student_profile.py
│       ├── klass.py                   # table name "classes"; module renamed to avoid Python keyword
│       ├── class_member.py
│       ├── assessment.py
│       ├── answer_key.py
│       ├── audit_log.py
│       └── llm_call_log.py
├── pyproject.toml                     # add sqlalchemy[asyncio], alembic, asyncpg
└── ... (Dockerfile, railway.json, etc. unchanged)

compose.yaml                           # repo root — Postgres 16 for local dev
```

### Component responsibilities

- **`db/base.py`** — declarative `Base = DeclarativeBase(...)` with a shared `MetaData` (custom naming convention for indexes and FKs so Alembic autogenerate produces deterministic names).
- **`db/session.py`** — owns the process-wide `AsyncEngine`, the `async_sessionmaker`, and the `get_session()` FastAPI dependency. Handles commit/rollback/close lifecycle.
- **`db/mixins.py`** — `TimestampMixin` (created_at, updated_at with server defaults), `SoftDeleteMixin` (deleted_at column), `TenantMixin` (nullable organization_id). Models compose only the mixins they need.
- **`models/*.py`** — one SQLAlchemy model per file, composing mixins. FK references use string form (`ForeignKey("users.id")`) to avoid circular imports.
- **`models/__init__.py`** — re-exports all models so `alembic/env.py` can `from grade_sight_api.models import *` and see the full metadata.
- **`alembic/env.py`** — async-aware, uses `AsyncEngine.begin()` + `run_sync(context.run_migrations)`. Standard SQLAlchemy 2.x pattern.

### Data flow

**Request path:**
1. FastAPI route declares `db: AsyncSession = Depends(get_session)`.
2. `get_session()` acquires a session from the sessionmaker.
3. Route runs queries; successful return triggers commit.
4. Exception triggers rollback; session closes in all cases.

**Migration path (local dev):**
1. Developer edits models in `models/*.py`.
2. Runs `pnpm db:makemigration -- "<message>"` → Alembic diffs models vs DB, writes a new file in `versions/`.
3. Developer reviews the generated migration by hand (autogenerate is a draft, not authoritative).
4. Runs `pnpm db:migrate` to apply.

**Migration path (production, manual):**
1. Developer sets `DATABASE_URL` locally to Railway's `DATABASE_PUBLIC_URL`.
2. Runs `pnpm db:migrate` against production DB.
3. Railway api service continues running against the same DB — no downtime if the migration is additive.

## Schema

### Cross-cutting conventions

- `id` — UUID PK, `gen_random_uuid()` Postgres-side default, `uuid4` app-side.
- `created_at`, `updated_at` — `TIMESTAMPTZ NOT NULL DEFAULT NOW()`. `updated_at` auto-refreshed via SQLAlchemy `onupdate`.
- `deleted_at` — `TIMESTAMPTZ NULL` on all operational tables. Not present on append-only logs.
- `organization_id` — `UUID NULL` FK to `organizations.id`, nullable to support parent-mode (no org).
- FK on-delete policy: **`RESTRICT`** by default (soft delete is the mechanism; hard delete requires orphan resolution).
  - Exception: `student_profiles.student_id` may use `CASCADE` (profile meaningless without student).
- All FK columns indexed.
- All `organization_id` columns indexed (tenant-scoped queries dominate).

### Tables

#### `organizations`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| name | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL default now() |
| updated_at | TIMESTAMPTZ | NOT NULL default now() |
| deleted_at | TIMESTAMPTZ | NULL |

No non-PK indexes day-one (low cardinality).

#### `users`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NULL, FK organizations.id |
| clerk_id | TEXT | NOT NULL, UNIQUE |
| email | TEXT | NOT NULL, UNIQUE |
| role | user_role ENUM | NOT NULL — values: `parent`, `teacher`, `admin` |
| first_name | TEXT | NULL |
| last_name | TEXT | NULL |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: `organization_id`. Uniques: `clerk_id`, `email`.

#### `students` (PII)

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NULL, FK organizations.id |
| created_by_user_id | UUID | NOT NULL, FK users.id |
| full_name | TEXT | NOT NULL |
| date_of_birth | DATE | NULL |
| consent_flags | JSONB | NOT NULL DEFAULT '{}'::jsonb |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: `organization_id`, `created_by_user_id`.
**Holds PII. No learning data here.**

#### `student_profiles` (non-PII, minimal)

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| student_id | UUID | NOT NULL, UNIQUE, FK students.id ON DELETE CASCADE |
| organization_id | UUID | NULL, FK organizations.id (denormalized from students for tenant-scoped queries) |
| grade_level | TEXT | NULL |
| metadata | JSONB | NOT NULL DEFAULT '{}'::jsonb |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: unique `student_id`, `organization_id`.

Intentionally thin. Rich learning data columns arrive with the diagnostic engine spec.

#### `classes`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NOT NULL, FK organizations.id (classes are always org-scoped) |
| teacher_id | UUID | NOT NULL, FK users.id |
| name | TEXT | NOT NULL |
| subject | TEXT | NULL |
| grade_level | TEXT | NULL |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: `organization_id`, `teacher_id`.

#### `class_members` (students ↔ classes)

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| class_id | UUID | NOT NULL, FK classes.id |
| student_id | UUID | NOT NULL, FK students.id |
| organization_id | UUID | NULL, FK organizations.id (denormalized for tenant queries) |
| joined_at | TIMESTAMPTZ | NOT NULL default now() |
| left_at | TIMESTAMPTZ | NULL |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: `class_id`, `student_id`. **Partial unique** on `(class_id, student_id) WHERE left_at IS NULL` (prevents duplicate active memberships while allowing historical re-enrollment).

#### `assessments`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NULL, FK organizations.id |
| student_id | UUID | NOT NULL, FK students.id |
| class_id | UUID | NULL, FK classes.id |
| answer_key_id | UUID | NULL, FK answer_keys.id |
| uploaded_by_user_id | UUID | NOT NULL, FK users.id |
| s3_url | TEXT | NOT NULL |
| original_filename | TEXT | NOT NULL |
| status | assessment_status ENUM | NOT NULL — `pending`, `processing`, `completed`, `failed` |
| uploaded_at | TIMESTAMPTZ | NOT NULL default now() |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: `organization_id`, `student_id`, `class_id`, `status`.

#### `answer_keys`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NULL, FK organizations.id |
| uploaded_by_user_id | UUID | NOT NULL, FK users.id |
| name | TEXT | NOT NULL |
| s3_url | TEXT | NULL |
| content | JSONB | NULL |
| created_at, updated_at, deleted_at | TIMESTAMPTZ | standard |

Indexes: `organization_id`, `uploaded_by_user_id`.

#### `audit_log` (append-only)

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NULL, FK organizations.id |
| user_id | UUID | NULL, FK users.id |
| resource_type | TEXT | NOT NULL |
| resource_id | UUID | NULL |
| action | TEXT | NOT NULL |
| metadata | JSONB | NOT NULL DEFAULT '{}'::jsonb |
| created_at | TIMESTAMPTZ | NOT NULL default now() |

Indexes: `organization_id`, `user_id`, `(resource_type, resource_id)`, `created_at`.
No `updated_at`, no `deleted_at`.

#### `llm_call_logs` (append-only)

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organization_id | UUID | NULL, FK organizations.id |
| user_id | UUID | NULL, FK users.id |
| model | TEXT | NOT NULL |
| tokens_input | INTEGER | NOT NULL |
| tokens_output | INTEGER | NOT NULL |
| cost_usd | NUMERIC(10,6) | NOT NULL |
| latency_ms | INTEGER | NOT NULL |
| request_type | TEXT | NOT NULL |
| success | BOOLEAN | NOT NULL |
| error_message | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL default now() |

Indexes: `organization_id`, `user_id`, `created_at`, `model`.

## Environment & Config

### New env vars (api service)

| Var | Required? | Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql+asyncpg://...` | Runtime DB connection |
| `TEST_DATABASE_URL` | no | `postgresql+asyncpg://...test` | Test harness target; defaults to DATABASE_URL with `_test` schema swap |

Pydantic `BaseSettings` extended to validate both as `PostgresDsn`. Missing `DATABASE_URL` causes FastAPI to fail at boot with a clear error (not a runtime crash deep in a handler).

### `.env.example` update

```
# Required
DATABASE_URL=postgresql+asyncpg://grade_sight:grade_sight@localhost:5432/grade_sight

# Optional — test harness; defaults to a _test suffix on DATABASE_URL if unset
TEST_DATABASE_URL=
```

## Local Dev

### `compose.yaml` (repo root)

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: grade_sight
      POSTGRES_USER: grade_sight
      POSTGRES_PASSWORD: grade_sight
    ports: ["5432:5432"]
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
```

### Developer flow (first time)

```bash
docker compose up -d db            # Postgres on localhost:5432
cp apps/api/.env.example apps/api/.env   # already exists from Spec 1; update DATABASE_URL
pnpm install                       # (already done)
pnpm db:migrate                    # apply initial migration
pnpm dev                           # start web + api; api connects to local Postgres
curl http://localhost:8000/api/db-health    # expect 200 + latency
```

### Root package.json additions

```json
{
  "scripts": {
    "db:migrate": "pnpm --filter api db:migrate",
    "db:makemigration": "pnpm --filter api db:makemigration",
    "db:rollback": "pnpm --filter api db:rollback"
  }
}
```

### `apps/api/package.json` additions

```json
{
  "scripts": {
    "db:migrate": "uv run alembic upgrade head",
    "db:makemigration": "uv run alembic revision --autogenerate -m",
    "db:rollback": "uv run alembic downgrade -1"
  }
}
```

## Testing Scaffolding

No assertions authored. Infrastructure only.

- `apps/api/tests/conftest.py` gains:
  - `async_engine` fixture (module-scope, uses `TEST_DATABASE_URL`)
  - `async_session` fixture (function-scope, opens a savepoint, rolls back after test)
  - `seed_organization`, `seed_user` factory stubs (no-op until tests use them)
- `@pytest.mark.db` marker for any future DB-backed test.
- Tests without the marker skip DB setup entirely.
- `pnpm test` continues to exit 0 (no tests collected → wrapper returns 0).

## Deployment Notes

- **Initial Railway Postgres provisioning** is user-performed (done).
- **Applying the initial migration to Railway Postgres** is manual for Spec 2:
  ```bash
  DATABASE_URL="<Railway DATABASE_PUBLIC_URL>" pnpm db:migrate
  ```
- After that, `GET <api-url>/api/db-health` should return 200.
- Subsequent migrations follow the same manual pattern until we build an automation pipeline.

## Out of Scope / Future Considerations

- **Prod migration automation** — Railway pre-deploy hook, or a separate migration service that runs before api deploys. Revisit when schema changes become routine (probably mid-Phase 2).
- **Row-level security (RLS)** — add if a compliance audit requires it or we see cross-tenant bugs.
- **Column-level PII encryption** — deferred; Railway's disk-level is our Phase 1 baseline.
- **Read replicas / connection pooling via pgbouncer** — ops hardening, not MVP scale.
- **Audit-log triggers** — we write to `audit_log` from the service layer (Spec 4). Triggers are a hardening alternative.
- **Seed data / fixture tooling** — deferred to either Spec 3 (auth flows need some users) or a dedicated dev-ops spec.
- **Taxonomy tables** (`error_categories`, `error_patterns`, `interventions`, `diagnostic_records`, `intervention_recommendations`, `intervention_outcomes`, `diagnostic_reviews`) — gated by the taxonomy-finalization Do-NOT-yet rule.
- **Subprocessors table** — admin/docs feature, not MVP.

## Acceptance Criteria

Implementation is done when all of these hold:

1. `alembic upgrade head` runs cleanly against a fresh Postgres (`docker compose up -d db` then `pnpm db:migrate`) and creates all 10 tables, both enums (`user_role`, `assessment_status`), and every index listed in this spec.
2. `alembic downgrade base` reverses cleanly to an empty schema (migration is reversible).
3. `alembic revision --autogenerate -m "test"` produces an **empty** migration immediately after a fresh upgrade — proves models exactly match the schema.
4. `GET /api/health` returns 200 (Spec 1 regression check).
5. `GET /api/db-health` returns `{"status": "ok", "latency_ms": <n>}` when DB is reachable; returns 503 with a useful error message when not.
6. FastAPI starts cleanly when `DATABASE_URL` is set to a valid Postgres; fails at boot (Pydantic validation error) when missing or malformed.
7. `pnpm db:migrate`, `pnpm db:makemigration`, `pnpm db:rollback` work from repo root.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all pass (no Spec 1 regressions).
9. The 10 SQLAlchemy model classes exist in `apps/api/src/grade_sight_api/models/`; `models/__init__.py` re-exports them all.
10. `compose.yaml` at repo root brings up Postgres 16 that the api can connect to.
11. `apps/api/.env.example` documents the new DB env vars with sensible local defaults.
12. `README.md` updated with: local DB startup flow, migration command list, manual prod-migration procedure.
13. `CLAUDE.md` **Current phase** line proposed (not committed without approval) to reflect Spec 2 completion.

## Implementation Overview

(Detailed in the subsequent implementation plan via the `writing-plans` skill.)

Rough shape:
1. Dependency additions: `sqlalchemy[asyncio]`, `alembic`, `asyncpg` in `apps/api/pyproject.toml`; `uv sync`.
2. `compose.yaml` at repo root; verify local Postgres comes up.
3. `db/base.py`, `db/mixins.py`, `db/session.py` — core connection machinery.
4. 10 model files in `models/` + `models/__init__.py` re-export.
5. Alembic init (`alembic init -t async alembic`), customize `env.py`, run first autogenerate, hand-review and commit `0001_initial_schema.py`.
6. Extend `config.py` with `database_url`, `test_database_url`.
7. Add `/api/db-health` endpoint.
8. `conftest.py` fixtures (no tests).
9. Root + api package.json script additions.
10. `.env.example` updates in `apps/api/`.
11. `README.md` updates.
12. Acceptance run: clean install → compose up → migrate → dev up → hit both endpoints → verify.
