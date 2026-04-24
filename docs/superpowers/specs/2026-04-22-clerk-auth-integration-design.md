# Clerk Auth Integration Design — Grade-Sight

**Status:** Approved, ready for implementation planning
**Date:** 2026-04-22
**Author:** David (with Claude Code)
**Scope:** Spec 3 of 4 decomposing the kickoff doc. Specs 1 (scaffolding) and 2 (DB schema + migrations) are complete and deployed. Spec 4 (external service abstraction layer) depends on this one.

## Problem

The api has persistent storage but no notion of a user — any request is anonymous. To build any real feature (assessment upload, student record access, diagnostic report, dashboard), we need authentication plus a mapping between authenticated Clerk users and rows in our `users` / `organizations` tables. CLAUDE.md locks the choice to Clerk with organizations support. The kickoff requires parent/teacher sign-up flows, auto-created orgs for teachers, and a base dashboard showing "Logged in as X". This spec turns that into a working end-to-end flow on web + api, with Clerk as the identity layer and our DB as the business-data layer.

## Goals

- A visitor can sign up as either a parent or a teacher via distinct entry points on the landing page.
- A parent user can complete sign-up, reach a protected `/dashboard`, and see their name and role.
- A teacher user can complete sign-up and have a Clerk organization + matching `organizations` row auto-created; `/dashboard` shows their name, role, and organization name.
- Authentication state persists across page loads; sign-out works; unauthenticated access to `/dashboard` redirects to `/sign-in`.
- The api exposes one authenticated endpoint (`GET /api/me`) returning the current user. It validates Clerk JWTs and lazily upserts the user row on first authenticated request.
- Local dev works against a Clerk development instance; production Railway deploy works against a Clerk production instance.

## Non-Goals

- **Admin role UI or behavior.** Enum value exists; no admin surface built.
- **Multi-org support** (users belonging to multiple orgs).
- **Inviting teachers** to an existing org.
- **Custom Clerk sign-up fields.** Stock Clerk UI; role handled via route choice.
- **Password reset, email verification, MFA flows** beyond Clerk defaults.
- **User data controls page** (view / export / delete). Privacy commitment, deferred.
- **Parent ↔ student account linking.**
- **Clerk webhooks for user events.** Lazy upsert only.
- **Org renaming, member management UI, role changes.**
- **Session refresh / rotation customization** — Clerk defaults.
- **Tests authored.** Scaffold only (kickoff constraint).

## Tooling Decisions (Locked)

| Area | Choice | Rationale |
|---|---|---|
| Identity provider | **Clerk** | Locked by CLAUDE.md; supports orgs + role routing + OAuth out of box |
| User sync strategy | **Lazy upsert in `get_current_user`** | Simpler than webhooks; no public endpoint to secure; source-of-truth boundaries stay clean |
| Role selection UX | **Two sign-up entry points** (`/sign-up/parent`, `/sign-up/teacher`) | Clearer UX; distinct messaging per audience; avoids "authenticated but role-unknown" limbo |
| Org creation UX | **Auto-create on first teacher request** with default name `"{First Last}'s Classroom"` | Lowest sign-up friction; rename deferred to later spec |
| Frontend SDK | **`@clerk/nextjs`** | Official Next.js integration; middleware + components ready-made |
| Backend SDK | **`clerk-backend-api`** (official Python SDK) | Handles JWKS verification + Clerk API calls |
| Role security | User-declared role via `unsafeMetadata`; server coerces to `{parent, teacher}` | Admin is internal-only; the other two are both user-self-service; no elevation risk |
| Session transport | Clerk's session token as `Authorization: Bearer <token>` | Canonical Clerk pattern |

## Architecture

### Identity boundary

- **Clerk** owns: authentication, email verification, password reset, MFA, OAuth, session management, Clerk organization lifecycle.
- **Our DB** owns: `users.role`, `users.organization_id`, everything business-domain.
- **Mapping:** `users.clerk_id` (unique) links Clerk's user to our row. `organizations.clerk_org_id` (new in this spec) links Clerk's org to our row.

### Frontend layout (`apps/web`)

```
apps/web/
├── app/
│   ├── layout.tsx                              # <ClerkProvider> wrap
│   ├── page.tsx                                # UPDATED: two CTAs (parent / teacher)
│   ├── sign-in/[[...sign-in]]/page.tsx         # NEW: <SignIn> component
│   ├── sign-up/
│   │   ├── parent/[[...sign-up]]/page.tsx      # NEW: <SignUp unsafeMetadata={{role:"parent"}}>
│   │   └── teacher/[[...sign-up]]/page.tsx     # NEW: <SignUp unsafeMetadata={{role:"teacher"}}>
│   └── dashboard/
│       └── page.tsx                            # NEW: protected; calls GET /api/me
├── middleware.ts                               # NEW: clerkMiddleware(), protects /dashboard
├── lib/api.ts                                  # NEW: fetch wrapper attaches Clerk session token
└── env.ts                                      # UPDATED: add Clerk pub key validation
```

### Backend layout (`apps/api`)

```
apps/api/src/grade_sight_api/
├── config.py                       # UPDATED: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY
├── auth/
│   ├── __init__.py                 # NEW
│   ├── clerk.py                    # NEW: Clerk SDK client singleton + JWT verify helpers
│   └── dependencies.py             # NEW: get_current_user FastAPI dep
├── schemas/
│   ├── __init__.py                 # NEW
│   └── me.py                       # NEW: UserResponse / OrganizationResponse Pydantic models
├── routers/
│   ├── __init__.py                 # NEW
│   └── me.py                       # NEW: GET /api/me
├── models/
│   └── organization.py             # UPDATED: add clerk_org_id column
└── main.py                         # UPDATED: include me router
```

Plus one new Alembic migration adding `organizations.clerk_org_id`.

### Data flow — parent sign-up

1. Visitor on `/` clicks **Sign up as parent**.
2. Browser navigates to `/sign-up/parent`; Clerk's `<SignUp>` renders with `unsafeMetadata: { role: "parent" }`.
3. Clerk completes sign-up, email verification, password set (as configured), then redirects to `/dashboard`.
4. `middleware.ts` sees authenticated session, passes through.
5. Dashboard page calls `GET /api/me` with `Authorization: Bearer <token>` from `getToken()`.
6. FastAPI `get_current_user` dep verifies token, runs lazy upsert:
   - No existing `users` row for this `clerk_id` → create one with `role=parent`, `organization_id=NULL`.
7. `/api/me` returns the new user. Dashboard renders `Logged in as {first_name} (parent)`.

### Data flow — teacher sign-up

Same as parent through step 5. At step 6, lazy upsert detects `unsafeMetadata.role=teacher`:

- Call Clerk SDK `organizations.create(name=default_name, created_by=clerk_user_id)`. Default name `"{First Last}'s Classroom"`, fallback `"{email-localpart}'s Classroom"` if names empty.
- Insert `organizations` row (`name=default_name`, `clerk_org_id=clerk_org.id`).
- Insert `users` row (`role=teacher`, `organization_id=new_org.id`).

Dashboard renders `Logged in as {first_name} (teacher) — {org_name}`.

### Lazy upsert algorithm (`get_current_user`)

Runs on every authenticated request:

```
1. Extract Bearer token → 401 if missing/malformed.
2. Verify JWT against Clerk JWKS via SDK → 401 on failure.
3. Extract clerk_user_id, email from claims.
4. SELECT users WHERE clerk_id = clerk_user_id AND deleted_at IS NULL.
5. If found:
     a. Fetch Clerk user via SDK (for first_name, last_name, current email).
     b. If any of email/first_name/last_name differ, UPDATE them.
     c. Return the row.
6. If not found:
     a. Fetch Clerk user via SDK.
     b. role = unsafeMetadata.role; coerce to "parent" if not in {parent, teacher}. Log warning on coercion.
     c. If role=teacher:
          - org = Clerk SDK organizations.create(name=default_name, created_by=clerk_user_id).
          - INSERT organizations (clerk_org_id=org.id, name=default_name).
          - org_id = inserted id.
        Else:
          - org_id = None.
     d. INSERT users (clerk_id, email, role, first_name, last_name, organization_id=org_id).
     e. Return the new row.
```

### Failure modes

| Scenario | Behavior |
|---|---|
| Missing/invalid Bearer token | 401 from dep |
| Clerk JWKS unreachable | 503 from dep; client retries |
| Clerk API `organizations.create` fails after Clerk user exists | 500 to client; user row NOT inserted; next request retries whole creation. Dangling Clerk org is acceptable at Phase 1 scale. |
| DB insert fails after Clerk org created | Same as above — dangling Clerk org, no user row, retry on next request. |
| `unsafeMetadata.role` missing or invalid | Coerce to `parent`, log warning. |
| User claims `role=admin` at sign-up | Coerce to `parent`, log warning. |

### Sign-out

Clerk's `<SignOutButton>` / `signOut()` clears the session. No backend work. Subsequent `GET /api/me` returns 401; middleware redirects to `/sign-in`.

### Unauthenticated access

- `middleware.ts` gates `/dashboard(.*)` via `createRouteMatcher`. Unauthenticated requests → redirect to `/sign-in`.
- Public: `/`, `/sign-in`, `/sign-up/parent`, `/sign-up/teacher`.
- FastAPI: `/api/health` and `/api/db-health` remain unauthenticated. `/api/me` requires auth.

## Schema Migration

New Alembic migration `0002_add_clerk_org_id.py`:

```python
def upgrade() -> None:
    op.add_column(
        'organizations',
        sa.Column('clerk_org_id', sa.Text(), nullable=True),
    )
    op.create_index(
        'uq_organizations_clerk_org_id',
        'organizations',
        ['clerk_org_id'],
        unique=True,
        postgresql_where=sa.text('clerk_org_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_organizations_clerk_org_id', table_name='organizations')
    op.drop_column('organizations', 'clerk_org_id')
```

SQLAlchemy model update:

```python
# organization.py
clerk_org_id: Mapped[str | None] = mapped_column(unique=True, nullable=True)
```

- **Nullable** — supports parent users (no org) and hypothetical future orgs we create without a Clerk counterpart.
- **Partial unique** — uniqueness enforced only on populated values, so multiple `NULL`s don't conflict.

## Environment Variables

### `apps/web/.env.example` additions

```
# Required (from Clerk dashboard — Development instance)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Routing (fixed values for our flow)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

`env.ts` validates the required two (publishable + secret) with zod; the three routing vars have sensible Clerk defaults but we set them explicitly for clarity.

### `apps/api/.env.example` additions

```
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

Both required. Pydantic `BaseSettings` adds them as required fields.

### Railway (production)

Each service's Variables tab gets the `pk_live_...` / `sk_live_...` counterparts. Setting these is a one-time manual action after spinning up the Clerk production instance (which requires a verified domain).

## Endpoints

New FastAPI route in `routers/me.py`:

```python
from fastapi import APIRouter, Depends
from ..auth.dependencies import get_current_user
from ..models.user import User
from ..schemas.me import UserResponse

router = APIRouter()

@router.get("/api/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
```

Included in `main.py` via `app.include_router(me.router)`.

### Pydantic response schemas (`schemas/me.py`)

```python
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from ..models.user import UserRole


class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: UUID
    email: str
    role: UserRole
    first_name: str | None
    last_name: str | None
    organization: OrganizationResponse | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

`clerk_id`, `consent_flags`, `updated_at`, `deleted_at` are intentionally omitted.

## Shared Types

`packages/shared/src/index.ts` additions:

```typescript
// New branded ID
export type UserId = string & { readonly __brand: "UserId" };

// Response shape for GET /api/me
export interface UserResponse {
  id: UserId;
  email: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  organization: { id: OrganizationId; name: string } | null;
  created_at: string; // ISO 8601
}
```

## Dependencies

### Frontend
```bash
pnpm --filter web add @clerk/nextjs
```

### Backend
Add to `apps/api/pyproject.toml`:
```
"clerk-backend-api>=1.0.0",
```

## Testing (Scaffold only)

No assertions authored. Additions:

- `conftest.py` gains a stubbed `authenticated_client` fixture (returns `None` for now). Future tests will use Clerk's Testing Tokens feature.
- `pnpm test` continues to pass (zero tests collected; wrapper converts exit 5 to 0).
- `apps/web` no test additions.

## Deployment Steps (Post-Implementation)

1. **Create a Clerk production instance** in the Clerk dashboard (requires verifying a domain; not part of this repo's code).
2. **Apply Spec 3 migration to Railway Postgres**:
   ```bash
   DATABASE_URL="postgresql+asyncpg://postgres:<pwd>@<host>.proxy.rlwy.net:<port>/railway" pnpm db:migrate
   ```
3. **Set production Clerk keys on Railway**: web service and api service get `pk_live_...` / `sk_live_...` in their Variables tabs.
4. **Verify deployed sign-up**: Create a parent test account via the deployed URL; confirm dashboard renders.
5. **Verify deployed teacher sign-up**: Same flow with `/sign-up/teacher`; confirm Clerk org + DB org row both exist.

## Acceptance Criteria

Implementation is done when all of these hold:

1. Landing page `/` renders two distinct CTAs: "Sign up as parent" and "Sign up as teacher".
2. Parent sign-up completes end-to-end; user lands on `/dashboard` showing "Logged in as {first_name} (parent)".
3. Teacher sign-up completes end-to-end; Clerk org is created; matching `organizations` row exists with `clerk_org_id` populated; dashboard shows "Logged in as {first_name} (teacher) — {org_name}".
4. Clicking sign-out clears the session; subsequent `/dashboard` visits redirect to `/sign-in`.
5. Unauthenticated access to `/dashboard` redirects to `/sign-in` via middleware.
6. `GET /api/me` returns 401 without a valid Clerk JWT, and the `UserResponse` JSON with a valid one.
7. Lazy upsert behaviors verified:
   - New Clerk user → row inserted on first authenticated request.
   - Returning user with changed email/name in Clerk → row updated.
   - Role missing or invalid in metadata → coerced to `parent`, warning logged.
8. Sign-in from `/sign-in` redirects to `/dashboard` on success.
9. Migration `0002_add_clerk_org_id.py` is reversible (`pnpm db:rollback` + `pnpm db:migrate` round-trip).
10. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all pass (no Specs 1/2 regressions).
11. `packages/shared` exports `UserId` branded type and `UserResponse` interface.
12. Root `README.md` documents Clerk dev-key setup (where to get keys, where to put them).
13. Local dev flow works: `docker compose up -d db && pnpm install && pnpm db:migrate && pnpm dev` + opening the browser yields a working sign-up → dashboard loop.
14. Deployed to Railway against Clerk production keys: a real account can be created via deployed URLs and reaches the deployed dashboard.

## Out of Scope / Future Considerations

- **Clerk webhooks** — consider for push-style user updates (e.g., when a user is deleted on Clerk's side, we soft-delete in our DB). Arrives if/when we need it.
- **Admin role surface** — protected admin pages, feature flags, internal tools. Separate spec.
- **Multi-org and org invitations** — when teachers start collaborating or schools standardize on the platform.
- **Parent ↔ student linking** — which students a parent can see. Comes with assessment upload / diagnostic spec.
- **Org renaming + member management UI** — teacher settings page. Separate spec.
- **Role audit trail** — currently no changes-over-time; when we add role changes, `audit_log` entries get written.
- **Session / JWT caching** — the lazy upsert fetches Clerk user data via SDK on every request. Fine at Phase 1 scale; add a short TTL cache when request volume warrants.
- **Rate limiting on authenticated endpoints** — not needed yet; relevant when batch upload arrives.

## Implementation Overview

(Detailed in the subsequent implementation plan via the `writing-plans` skill.)

Rough shape:

1. Add `@clerk/nextjs` + `clerk-backend-api` deps.
2. Schema migration: `organizations.clerk_org_id` + index. Update ORM. Generate + commit migration.
3. Frontend: `<ClerkProvider>` in root layout, env.ts validation, `middleware.ts`, sign-in / sign-up routes, dashboard page, landing-page CTAs, `lib/api.ts` fetcher.
4. Backend: `config.py` extension, `auth/clerk.py` SDK wiring, `auth/dependencies.py` `get_current_user` with full lazy-upsert logic, `schemas/me.py`, `routers/me.py`, main.py include.
5. Update `packages/shared` with `UserId` + `UserResponse`.
6. Update `.env.example` files and README.
7. Acceptance run: clean install + full verification + browser test of both sign-up flows against local Clerk dev keys.
