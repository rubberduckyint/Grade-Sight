# Clerk Auth Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Clerk authentication per `docs/superpowers/specs/2026-04-22-clerk-auth-integration-design.md` — two sign-up entry points (parent / teacher), lazy upsert into our `users` table, auto-created Clerk org for teachers, protected `/dashboard` route, and `GET /api/me`.

**Architecture:** Clerk owns identity (signup, sessions, email verification, orgs); our DB owns business data. A `get_current_user` FastAPI dependency verifies Clerk JWTs and lazily upserts the user row on first authenticated request. Next.js middleware protects `/dashboard`; Clerk's components render sign-in and sign-up UIs. Role travels from the sign-up URL (`/sign-up/parent` vs `/sign-up/teacher`) into Clerk's `unsafeMetadata`; the backend coerces to `{parent, teacher}`.

**Tech Stack:** `@clerk/nextjs` (frontend), `clerk-backend-api` (Python, JWT + admin API), plus existing Spec 2 stack (SQLAlchemy 2.x async, Alembic, FastAPI, Pydantic v2).

**No tests authored.** Kickoff constraint. Verification per task is running commands and confirming expected output; end-to-end browser testing of sign-up flows is a user-driven manual acceptance pass (Task 11).

**Prerequisites before Task 11 (user-side, not blocking Tasks 1–10):**
- Clerk account created at https://clerk.com
- A Clerk "Development" instance provisioned; copy `pk_test_...` and `sk_test_...`
- In Clerk's dashboard, enable **organizations** feature on the dev instance (so org creation works)
- Production instance setup deferred (requires a verified domain; separate post-implementation step)

---

## Task 1: Dependencies + env config

**Files:**
- Modify: `apps/web/package.json`, `apps/web/env.ts`, `apps/web/.env.example`, `apps/web/.env.local`
- Modify: `apps/api/pyproject.toml`, `apps/api/uv.lock`, `apps/api/src/grade_sight_api/config.py`, `apps/api/.env.example`, `apps/api/.env`

- [ ] **Step 1: Add `@clerk/nextjs` to web**

Run from repo root:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web add @clerk/nextjs
```

Expected: latest `@clerk/nextjs` added to `apps/web/package.json` dependencies. No errors. `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add `clerk-backend-api` to api**

Edit `/Users/exexporerporer/Projects/Grade-Sight/apps/api/pyproject.toml`. In the `dependencies` list, add:

```
"clerk-backend-api>=2.0.0",
```

Final `dependencies`:
```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.5.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "alembic>=1.14.0",
    "asyncpg>=0.30.0",
    "clerk-backend-api>=2.0.0",
]
```

Then sync:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv sync
```

Expected: clerk-backend-api (and its deps) installed. No errors.

- [ ] **Step 3: Update `apps/api/src/grade_sight_api/config.py`**

Overwrite with (exactly):

```python
"""Typed settings loaded from environment variables."""

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Grade-Sight API."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    api_port: int = 8000
    cors_origin: str = "http://localhost:3000"
    log_level: str = "info"
    environment: str = "development"

    database_url: PostgresDsn
    test_database_url: PostgresDsn | None = None

    clerk_secret_key: str
    clerk_publishable_key: str


settings = Settings()  # type: ignore[call-arg]
```

Only additions: two `clerk_*` fields.

- [ ] **Step 4: Update `apps/api/.env.example`**

Overwrite with:

```
# Required
API_PORT=8000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://grade_sight:grade_sight@localhost:5432/grade_sight
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Optional — defaults to DATABASE_URL with _test suffix if unset
TEST_DATABASE_URL=

# Future (uncomment when their spec lands):
# ANTHROPIC_API_KEY=
# SENTRY_DSN=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

- [ ] **Step 5: Update `apps/api/.env`**

Read the current file; it has API_PORT, CORS_ORIGIN, LOG_LEVEL, ENVIRONMENT, DATABASE_URL. Append two lines:

```
CLERK_SECRET_KEY=sk_test_REPLACE_ME
CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
```

(The `REPLACE_ME` placeholders prevent Pydantic validation errors at local dev time. The user replaces these with real Clerk dev keys before testing sign-up in Task 11. `.env` is gitignored; don't stage it.)

- [ ] **Step 6: Update `apps/web/env.ts`**

Overwrite with (exactly):

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string().url(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().default("/dashboard"),
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().default("/dashboard"),
  },
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 7: Update `apps/web/.env.example`**

Overwrite with:

```
# Required
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Routing (fixed)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Future (uncomment when their spec lands):
# NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 8: Update `apps/web/.env.local`**

Read the current file (it has `NEXT_PUBLIC_API_URL=http://localhost:8000`). Append:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
CLERK_SECRET_KEY=sk_test_REPLACE_ME
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

(`.env.local` is gitignored; don't stage.)

- [ ] **Step 9: Verify imports**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from clerk_backend_api import Clerk; print('clerk-backend-api ok')"
```

Expected: prints `clerk-backend-api ok`, no import errors.

Also verify app still starts (settings validate):
```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.main import app; print('app ok')"
```
Expected: prints `app ok`.

Verify web deps:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web typecheck
```
Expected: no errors. (`env.ts` is imported at build time later; no errors means no syntax issues.)

- [ ] **Step 10: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/web/package.json \
  apps/web/env.ts \
  apps/web/.env.example \
  apps/api/pyproject.toml \
  apps/api/uv.lock \
  apps/api/src/grade_sight_api/config.py \
  apps/api/.env.example \
  pnpm-lock.yaml
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add @clerk/nextjs and clerk-backend-api deps + env wiring

Both apps get Clerk SDK deps. Web's env.ts adds required Clerk
publishable + secret key validation and routing defaults. Api's
config adds clerk_secret_key and clerk_publishable_key as required
PostgresDsn-sibling fields. .env.example files updated with Clerk
placeholders; .env / .env.local (gitignored) updated locally.

Per docs/superpowers/specs/2026-04-22-clerk-auth-integration-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema migration (`clerk_org_id`)

**Files:**
- Modify: `apps/api/src/grade_sight_api/models/organization.py`
- Create: `apps/api/alembic/versions/<timestamp>_add_clerk_org_id.py`

- [ ] **Step 1: Update `organization.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/organization.py`

Overwrite with:

```python
"""Organization model — top-level tenant. Nullable FK for parent-mode users."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
    clerk_org_id: Mapped[str | None] = mapped_column(
        unique=True,
        nullable=True,
    )
```

- [ ] **Step 2: Confirm DB is up and at current head**

```bash
docker compose -f /Users/exexporerporer/Projects/Grade-Sight/compose.yaml ps
```
Expected: `db` healthy.

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic current
```
Expected: shows `b9189088c385 (head)` — the initial schema from Spec 2.

- [ ] **Step 3: Autogenerate the migration**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic revision --autogenerate -m "add clerk_org_id to organizations"
```

Expected: a new file `alembic/versions/<timestamp>_add_clerk_org_id.py` is created. Console output mentions adding `organizations.clerk_org_id` column.

- [ ] **Step 4: Review the generated migration**

Read the new migration file. Confirm:
- `upgrade()` has `op.add_column('organizations', sa.Column('clerk_org_id', sa.Text(), nullable=True))` (or `sa.String()` — both acceptable).
- `upgrade()` creates a **unique** index on `clerk_org_id`. Alembic typically generates `op.create_unique_constraint(...)` for `unique=True` on mapped_column — that's acceptable.
- `downgrade()` reverses both operations in the correct order.

**Spec requires a partial unique index** (`WHERE clerk_org_id IS NOT NULL`), but SQLAlchemy's `mapped_column(unique=True, nullable=True)` generates a plain unique constraint — which in Postgres already treats NULLs as non-conflicting for uniqueness, so the partial-WHERE is not strictly necessary in Postgres. The plain unique is acceptable.

If the autogenerated migration produced the plain unique (the usual outcome), **leave it as-is** — it behaves the same.

- [ ] **Step 5: Apply the migration**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic upgrade head
```

Expected: `Running upgrade b9189088c385 -> <new_rev>, add clerk_org_id to organizations`.

- [ ] **Step 6: Verify the column exists**

```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\d organizations"
```

Expected: the table description shows `clerk_org_id | text | | |` (or similar) plus the uniqueness constraint.

- [ ] **Step 7: Drift-check and reversibility**

Drift-check (should be empty):
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic revision --autogenerate -m "drift check"
```
Open the new file — `upgrade()` and `downgrade()` bodies should be `pass`. Delete the drift file:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api/alembic/versions
LATEST=$(ls -t | grep -v ".gitkeep" | head -1)
rm "$LATEST"
```

Reversibility:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic downgrade -1 && uv run alembic upgrade head
```
Expected: downgrade prints `Running downgrade`; upgrade prints `Running upgrade`. Both exit 0.

- [ ] **Step 8: Verify mypy + lint pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/api/src/grade_sight_api/models/organization.py \
  apps/api/alembic/versions
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add clerk_org_id to organizations + migration

organizations.clerk_org_id (text, unique, nullable) maps Clerk's
org id to our row. Nullable because parent users have no org, and
because hypothetical non-Clerk-sourced orgs stay valid. Unique
enforces one row per Clerk org. Postgres treats NULLs as
non-conflicting for unique, so a partial index isn't needed.

Migration verified reversible and drift-free.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend Clerk SDK wiring

**Files:**
- Create: `apps/api/src/grade_sight_api/auth/__init__.py`
- Create: `apps/api/src/grade_sight_api/auth/clerk.py`

- [ ] **Step 1: Create `auth/` directory**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/auth
```

- [ ] **Step 2: Write `auth/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/auth/__init__.py`

Content:
```python
"""Clerk authentication: JWT verification + user/org sync."""
```

- [ ] **Step 3: Write `auth/clerk.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/auth/clerk.py`

Content (exactly):
```python
"""Clerk SDK client and authentication helpers.

Owns:
- the process-wide Clerk client (admin-API calls: fetch user, create org)
- JWT verification via Clerk's authenticate_request helper

Used by dependencies.get_current_user.
"""

from __future__ import annotations

from clerk_backend_api import Clerk
from clerk_backend_api.jwks_helpers import (
    AuthenticateRequestOptions,
    authenticate_request,
)

from ..config import settings

# Process-wide Clerk client for admin API calls.
clerk_client: Clerk = Clerk(bearer_auth=settings.clerk_secret_key)


def verify_request_auth(request_headers: dict[str, str]) -> str | None:
    """Verify a Clerk session from request headers; return clerk user id or None.

    Wraps clerk_backend_api.authenticate_request. Returns the Clerk user id
    (the `sub` claim) on success; None if the request is unauthenticated or
    the token is invalid.
    """
    state = authenticate_request(
        request_headers,
        AuthenticateRequestOptions(
            secret_key=settings.clerk_secret_key,
            publishable_key=settings.clerk_publishable_key,
        ),
    )
    if not state.is_signed_in:
        return None
    # state.payload has the decoded JWT claims; `sub` is the Clerk user id.
    payload = state.payload
    if payload is None:
        return None
    return str(payload.get("sub")) if payload.get("sub") else None
```

- [ ] **Step 4: Verify imports**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.auth.clerk import clerk_client, verify_request_auth; print('clerk wiring ok')"
```

Expected: prints `clerk wiring ok`. No import errors.

If you see `ImportError: cannot import name 'authenticate_request' from 'clerk_backend_api.jwks_helpers'`, the Clerk SDK version's helper-module layout may differ. Report `DONE_WITH_CONCERNS` — the fix is adjusting the import path based on the installed SDK version (likely `from clerk_backend_api.security import authenticate_request` or similar).

Also verify mypy + lint pass:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass. If mypy complains about Clerk SDK types, add `# type: ignore[attr-defined]` narrowly on the offending import.

- [ ] **Step 5: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/auth
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add Clerk SDK wiring — client singleton + JWT verify helper

auth/clerk.py owns the process-wide Clerk client (for admin API
calls like user fetch and organization creation) and wraps
authenticate_request for session-token verification. Returns the
Clerk user id on success, None otherwise — leaves 401 handling
to the FastAPI dependency layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend `get_current_user` + lazy upsert

**Files:**
- Create: `apps/api/src/grade_sight_api/auth/dependencies.py`

- [ ] **Step 1: Write `auth/dependencies.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/auth/dependencies.py`

Content (exactly):
```python
"""FastAPI authentication dependencies.

get_current_user:
  - Verifies the Clerk session token from request headers.
  - Lazily upserts the user row in our DB on first authenticated request.
  - For teacher role on first request: auto-creates a Clerk org + our row.
  - Returns the live User ORM instance.

Role security: unsafeMetadata.role is user-controllable. We accept only
{parent, teacher}; any other value (including admin) coerces to parent.
"""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.organization import Organization
from ..models.user import User, UserRole
from .clerk import clerk_client, verify_request_auth

logger = logging.getLogger(__name__)

_ALLOWED_SELF_SERVICE_ROLES = {UserRole.parent, UserRole.teacher}


def _normalize_role(raw: object) -> UserRole:
    """Coerce a Clerk metadata role value into a safe UserRole.

    Anything that isn't exactly 'teacher' becomes 'parent'. Admin role is
    NOT self-service assignable — must be set by a direct DB edit.
    """
    if isinstance(raw, str) and raw == "teacher":
        return UserRole.teacher
    if isinstance(raw, str) and raw == "parent":
        return UserRole.parent
    logger.warning(
        "Clerk user metadata role was missing or invalid (%r); coercing to parent",
        raw,
    )
    return UserRole.parent


def _default_org_name(first_name: str | None, last_name: str | None, email: str) -> str:
    """Build the default auto-created org name for a teacher signup.

    '{First Last}'s Classroom' when both names present; else email-local-part.
    """
    parts = [p for p in (first_name, last_name) if p]
    if parts:
        return f"{' '.join(parts)}'s Classroom"
    local = email.split("@")[0] if "@" in email else email
    return f"{local}'s Classroom"


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    """Verify Clerk session and return (or lazily create) the matching User row.

    Raises 401 on unauthenticated or invalid tokens.
    """
    headers = {k: v for k, v in request.headers.items()}
    clerk_user_id = verify_request_auth(headers)
    if clerk_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthenticated",
        )

    result = await db.execute(
        select(User).where(
            User.clerk_id == clerk_user_id,
            User.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    # Fetch Clerk user data; we need first/last/email for create OR for drift-update.
    clerk_user = clerk_client.users.get(user_id=clerk_user_id)

    email = ""
    primary_email_id = getattr(clerk_user, "primary_email_address_id", None)
    for addr in getattr(clerk_user, "email_addresses", None) or []:
        if addr.id == primary_email_id:
            email = addr.email_address
            break
    first_name = getattr(clerk_user, "first_name", None)
    last_name = getattr(clerk_user, "last_name", None)

    if existing is not None:
        changed = False
        if email and existing.email != email:
            existing.email = email
            changed = True
        if first_name != existing.first_name:
            existing.first_name = first_name
            changed = True
        if last_name != existing.last_name:
            existing.last_name = last_name
            changed = True
        if changed:
            await db.flush()
        return existing

    # New user — create row. Determine role + maybe create Clerk org.
    unsafe_meta = getattr(clerk_user, "unsafe_metadata", None) or {}
    role = _normalize_role(unsafe_meta.get("role") if isinstance(unsafe_meta, dict) else None)

    organization_id = None
    if role == UserRole.teacher:
        org_name = _default_org_name(first_name, last_name, email)
        # Create Clerk org first (so we have the clerk_org_id).
        clerk_org = clerk_client.organizations.create(
            name=org_name,
            created_by=clerk_user_id,
        )
        new_org = Organization(name=org_name, clerk_org_id=clerk_org.id)
        db.add(new_org)
        await db.flush()  # populate new_org.id
        organization_id = new_org.id

    new_user = User(
        clerk_id=clerk_user_id,
        email=email,
        role=role,
        first_name=first_name,
        last_name=last_name,
        organization_id=organization_id,
    )
    db.add(new_user)
    await db.flush()
    return new_user
```

- [ ] **Step 2: Verify imports + types**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.auth.dependencies import get_current_user; print('dep ok')"
```
Expected: prints `dep ok`.

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src
```
Expected: Success. If Clerk SDK types are loose and cause mypy complaints, add `# type: ignore[...]` narrowly rather than widening type definitions.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run ruff check
```
Expected: All checks passed.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/auth/dependencies.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add get_current_user FastAPI dep with lazy upsert

auth/dependencies.get_current_user verifies the Clerk session,
lazily inserts the matching users row on first authenticated
request, and — for role=teacher — auto-creates a Clerk
organization plus our organizations row with clerk_org_id mapped.
Returning users have first_name/last_name/email refreshed from
Clerk on each request.

Role coercion: unsafeMetadata.role is user-controllable, so only
{parent, teacher} are accepted; anything else (including admin)
falls back to parent with a warning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Backend `/api/me` endpoint

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/__init__.py`
- Create: `apps/api/src/grade_sight_api/schemas/me.py`
- Create: `apps/api/src/grade_sight_api/routers/__init__.py`
- Create: `apps/api/src/grade_sight_api/routers/me.py`
- Modify: `apps/api/src/grade_sight_api/main.py`

- [ ] **Step 1: Create schemas + routers directories**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/schemas
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers
```

- [ ] **Step 2: Write `schemas/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/schemas/__init__.py`

Content:
```python
"""Pydantic schemas for API request / response bodies."""
```

- [ ] **Step 3: Write `schemas/me.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/schemas/me.py`

Content (exactly):
```python
"""Response schemas for the /api/me endpoint."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from ..models.user import UserRole


class OrganizationResponse(BaseModel):
    """Nested org in /api/me. Just id + name; no clerk_org_id."""

    id: UUID
    name: str
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    """Response shape for GET /api/me.

    Intentionally omits clerk_id, consent_flags, updated_at, deleted_at.
    """

    id: UUID
    email: str
    role: UserRole
    first_name: str | None
    last_name: str | None
    organization: OrganizationResponse | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 4: Write `routers/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers/__init__.py`

Content:
```python
"""FastAPI route modules."""
```

- [ ] **Step 5: Write `routers/me.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers/me.py`

Content (exactly):
```python
"""GET /api/me — return the current authenticated user."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.user import User
from ..schemas.me import OrganizationResponse, UserResponse

router = APIRouter()


@router.get("/api/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> UserResponse:
    """Return the current user + (optional) organization.

    Loads the organization via a second query rather than ORM relationship
    navigation — models don't yet define a User.organization relationship
    (deferred to when it's actually needed in multiple places).
    """
    org_response: OrganizationResponse | None = None
    if user.organization_id is not None:
        from ..models.organization import Organization

        result = await db.execute(
            select(Organization).where(
                Organization.id == user.organization_id,
                Organization.deleted_at.is_(None),
            )
        )
        org = result.scalar_one_or_none()
        if org is not None:
            org_response = OrganizationResponse.model_validate(org)

    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        organization=org_response,
        created_at=user.created_at,
    )
```

- [ ] **Step 6: Update `main.py` to include the router**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/main.py`

Overwrite with:
```python
"""FastAPI application entry point."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import engine, get_session
from .routers import me as me_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Dispose of the async engine cleanly on shutdown."""
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="Grade-Sight API", version="0.0.0", lifespan=lifespan)

app.include_router(me_router.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Baseline health check — returns OK without touching the DB."""
    return {"status": "ok", "environment": settings.environment}


@app.get("/api/db-health")
async def db_health(db: AsyncSession = Depends(get_session)) -> dict[str, object]:
    """Verify DB connectivity with a round-trip SELECT 1."""
    started = time.perf_counter()
    try:
        result = await db.execute(text("SELECT 1"))
        _ = result.scalar()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"db unreachable: {exc.__class__.__name__}",
        ) from exc
    latency_ms = int((time.perf_counter() - started) * 1000)
    return {"status": "ok", "latency_ms": latency_ms}
```

Only changes: import `routers.me as me_router`, include its router.

- [ ] **Step 7: Verify app boots and /api/me returns 401 without auth**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.main import app; routes = sorted(r.path for r in app.routes); print(routes)"
```
Expected: list includes `/api/health`, `/api/db-health`, `/api/me`.

Boot + probe:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run uvicorn grade_sight_api.main:app --port 8002 > /tmp/gs-task5-uvicorn.log 2>&1 &
API_PID=$!
sleep 4

echo "--- /api/health (no auth) ---"
curl -s http://localhost:8002/api/health
echo ""

echo "--- /api/me (no auth → expect 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8002/api/me

kill $API_PID 2>/dev/null || true
sleep 1
```

Expected:
```
--- /api/health (no auth) ---
{"status":"ok","environment":"development"}
--- /api/me (no auth → expect 401) ---
HTTP 401
```

If /api/me returns 500, tail `/tmp/gs-task5-uvicorn.log` — most likely cause is the Clerk SDK signature of `authenticate_request` not matching what `auth/clerk.py` calls. Report DONE_WITH_CONCERNS with the traceback.

- [ ] **Step 8: mypy + lint**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/api/src/grade_sight_api/schemas \
  apps/api/src/grade_sight_api/routers \
  apps/api/src/grade_sight_api/main.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add /api/me endpoint with UserResponse schema

schemas/me.py defines UserResponse (omits clerk_id, consent_flags,
internal timestamps) plus OrganizationResponse (id + name only).
routers/me.py wires the endpoint with get_current_user dep; loads
organization via a second query rather than adding a relationship
to the User model (deferred until used in multiple places).

main.py now includes the me router. /api/health and /api/db-health
remain unauthenticated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Shared types

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Update `packages/shared/src/index.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/packages/shared/src/index.ts`

Overwrite with:
```typescript
// Day-one types for Grade-Sight.
// Each type mirrors a Pydantic class in apps/api; the Python side remains the
// source of truth for runtime validation. Update both when changing a shape.

// Mirrors OrganizationId (Pydantic) — see apps/api/src/grade_sight_api/models.
export type OrganizationId = string & { readonly __brand: "OrganizationId" };

// Mirrors StudentId (Pydantic).
export type StudentId = string & { readonly __brand: "StudentId" };

// Mirrors AssessmentId (Pydantic).
export type AssessmentId = string & { readonly __brand: "AssessmentId" };

// Mirrors UserId (users.id — UUID).
export type UserId = string & { readonly __brand: "UserId" };

// Mirrors UserRole enum (Pydantic).
export type UserRole = "parent" | "teacher" | "admin";

// Skeleton for the diagnostic record. Full shape lives in
// docs/PROJECT_BRIEF.md §Diagnostic Output Schema. Expanded in a later spec
// once the diagnostic engine work begins.
export interface DiagnosticRecord {
  assessment_id: AssessmentId;
  student_id: StudentId;
  graded_at: string; // ISO 8601
}

// Response shape for GET /api/me (mirrors schemas/me.UserResponse).
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

- [ ] **Step 2: Build shared**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter @grade-sight/shared build
```
Expected: tsc emits updated `dist/index.js` and `dist/index.d.ts`.

Verify dist contains UserId + UserResponse:
```bash
grep -E "UserId|UserResponse" /Users/exexporerporer/Projects/Grade-Sight/packages/shared/dist/index.d.ts | head -5
```
Expected: matches for both.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  packages/shared/src/index.ts \
  packages/shared/dist
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add UserId branded type and UserResponse shape to @grade-sight/shared

Mirrors schemas/me.UserResponse on the api side. UserId is a new
branded string type; UserResponse nests an optional organization
with id+name. Consumed by apps/web/app/dashboard/page.tsx when it
calls GET /api/me.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: `dist/` is normally produced by build; whether to commit it depends on how the repo is set up. If `dist/` is gitignored (check with `git check-ignore packages/shared/dist`), remove it from the `git add`; turbo will build it on install. If it's committed (the case in Spec 1 scaffolding per the initial plan), commit as shown.

If `git add packages/shared/dist` fails with "ignored", drop that argument and commit only `packages/shared/src/index.ts`.

---

## Task 7: Frontend ClerkProvider + middleware

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Read the current `layout.tsx`**

```bash
cat /Users/exexporerporer/Projects/Grade-Sight/apps/web/app/layout.tsx
```

This file was created by `create-next-app`. Capture its current content before editing.

- [ ] **Step 2: Update `layout.tsx` to wrap in `<ClerkProvider>`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/layout.tsx`

The exact current contents vary by create-next-app version. The change is **wrap the `<html>` (or root element) with `<ClerkProvider>`** and **import `ClerkProvider` from `@clerk/nextjs`**. Example target shape:

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grade-Sight",
  description: "Diagnostic grading platform for secondary math",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

Preserve any fonts, class names, or Tailwind body classes that `create-next-app` had in the original. Just:
1. Add `import { ClerkProvider } from "@clerk/nextjs";`
2. Wrap the root return (whatever `<html>...</html>` block exists) in `<ClerkProvider>...</ClerkProvider>`.

- [ ] **Step 3: Create `middleware.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/middleware.ts`

Content (exactly):
```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
```

(This is Clerk's canonical middleware pattern for Next.js 15/16 App Router.)

- [ ] **Step 4: Verify web builds and typecheck passes**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && \
  pnpm --filter web typecheck && pnpm --filter web build
```
Expected: both pass. `next build` should output a successful build with routes listed.

If typecheck complains about `@clerk/nextjs` types, confirm the package is installed in `apps/web/node_modules` (re-run `pnpm install` if not).

- [ ] **Step 5: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/web/app/layout.tsx \
  apps/web/middleware.ts
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Wrap app in ClerkProvider + add auth middleware

layout.tsx now wraps the root in <ClerkProvider> so Clerk's context
is available everywhere. middleware.ts protects /dashboard(.*) via
auth.protect() from @clerk/nextjs/server; all other routes remain
public. Matcher pattern is Clerk's canonical App Router default —
skips Next internals and static files, always runs for /api.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend landing + auth pages

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/web/app/sign-up/parent/[[...sign-up]]/page.tsx`
- Create: `apps/web/app/sign-up/teacher/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Create sign-in page**

Create directory and file:
```bash
mkdir -p "/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/sign-in/[[...sign-in]]"
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/sign-in/[[...sign-in]]/page.tsx`

Content:
```tsx
import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 2: Create parent sign-up page**

```bash
mkdir -p "/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/sign-up/parent/[[...sign-up]]"
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/sign-up/parent/[[...sign-up]]/page.tsx`

Content:
```tsx
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign up as a parent</h1>
          <p className="mt-1 text-sm text-gray-600">
            Track your child&apos;s math progress with Grade-Sight.
          </p>
        </div>
        <SignUp
          unsafeMetadata={{ role: "parent" }}
          signInUrl="/sign-in"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create teacher sign-up page**

```bash
mkdir -p "/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/sign-up/teacher/[[...sign-up]]"
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/sign-up/teacher/[[...sign-up]]/page.tsx`

Content:
```tsx
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign up as a teacher</h1>
          <p className="mt-1 text-sm text-gray-600">
            We&apos;ll create your classroom organization automatically — you can rename it later.
          </p>
        </div>
        <SignUp
          unsafeMetadata={{ role: "teacher" }}
          signInUrl="/sign-in"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Update landing page with CTAs**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/page.tsx`

Overwrite with:
```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 md:p-24">
      <div className="flex flex-col items-center gap-8 text-center">
        <div>
          <h1 className="text-5xl font-bold tracking-tight">Grade-Sight</h1>
          <p className="mt-3 text-lg text-gray-600">
            Diagnostic grading for secondary math.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up/parent"
            className="rounded-lg border border-gray-300 px-6 py-3 text-base font-medium hover:bg-gray-50"
          >
            Sign up as parent
          </Link>
          <Link
            href="/sign-up/teacher"
            className="rounded-lg bg-black px-6 py-3 text-base font-medium text-white hover:bg-gray-800"
          >
            Sign up as teacher
          </Link>
        </div>
        <Link href="/sign-in" className="text-sm text-gray-500 underline">
          Already have an account? Sign in
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify build + typecheck**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && \
  pnpm --filter web typecheck && pnpm --filter web build
```
Expected: build succeeds. Routes listed in build output should include `/`, `/sign-in`, `/sign-up/parent`, `/sign-up/teacher`.

- [ ] **Step 6: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/web/app
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add sign-in, sign-up, and landing CTAs

Landing page has Sign up as parent and Sign up as teacher CTAs
plus an Already have an account? sign-in link. Clerk's <SignUp>
renders on /sign-up/parent and /sign-up/teacher with role in
unsafeMetadata. /sign-in renders Clerk's <SignIn>. Role is later
coerced server-side during the first authenticated request.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend dashboard + api client

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/app/dashboard/page.tsx`

- [ ] **Step 1: Create `lib/api.ts`**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/web/lib
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/lib/api.ts`

Content (exactly):
```typescript
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { UserResponse } from "@grade-sight/shared";

/**
 * Fetch the current user from our api, authenticated via the Clerk session.
 *
 * Server-only helper — uses Clerk's server-side `auth()` to get the
 * session token. Returns null on 401 (caller decides how to handle).
 */
export async function fetchMe(): Promise<UserResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`GET /api/me failed: ${response.status}`);
  }
  return (await response.json()) as UserResponse;
}
```

- [ ] **Step 2: Create `dashboard/page.tsx`**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/web/app/dashboard
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/dashboard/page.tsx`

Content (exactly):
```tsx
import { SignOutButton } from "@clerk/nextjs";
import { fetchMe } from "@/lib/api";

export default async function DashboardPage() {
  const user = await fetchMe();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>Loading…</p>
      </main>
    );
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-lg">
          Logged in as <strong>{displayName}</strong> ({user.role})
        </p>
        {user.organization && (
          <p className="text-sm text-gray-600">
            Organization: {user.organization.name}
          </p>
        )}
      </div>
      <SignOutButton>
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Sign out
        </button>
      </SignOutButton>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && \
  pnpm --filter web typecheck && pnpm --filter web build
```
Expected: build succeeds. The output should list `/dashboard` as a route.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/web/lib/api.ts \
  apps/web/app/dashboard
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add /dashboard page and fetchMe helper

lib/api.fetchMe attaches the Clerk session token via server-side
auth() and calls GET /api/me on our backend. Returns null on 401
so the caller can render a loading / unauthenticated state.

/dashboard page is a protected server component (middleware already
enforces this). Renders "Logged in as {displayName} ({role})" plus
an optional organization line for teachers, plus a Clerk sign-out
button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: README update + final cleanup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Clerk setup section to `README.md`**

Read `/Users/exexporerporer/Projects/Grade-Sight/README.md`. After the `## Environment variables` section, insert a new `## Clerk authentication (local dev)` section.

Using the Edit tool with a unique old_string like `## Deployment` (or whatever heading comes right after the env-vars section), insert the new section BEFORE it.

New section content (paste verbatim — replace `TRIPLE_BACKTICKS` in the instructions below with three literal backticks in the final file):

```
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

TRIPLE_BACKTICKSbash
# apps/web/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# apps/api/.env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
TRIPLE_BACKTICKS

5. Restart `pnpm dev` so the new env vars load.
6. Visit http://localhost:3000 and click either "Sign up as parent" or "Sign
   up as teacher". Clerk's sign-up flow runs. On completion you land on
   `/dashboard` showing "Logged in as {name} ({role})".

Production Clerk instance (required before deploying to Railway with real
users) uses `pk_live_` / `sk_live_` keys and requires a verified domain.
Set those in Railway's Variables tab per service.
```

Use Edit carefully — replace ALL occurrences of `TRIPLE_BACKTICKS` in the inserted content with three literal backtick characters (```). The goal is a properly-fenced bash code block in the README.

- [ ] **Step 2: Verify README renders + all checks still pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm typecheck && pnpm lint && pnpm build && pnpm test
```
Expected: all four exit 0.

Verify no `TRIPLE_BACKTICKS` placeholders remain:
```bash
grep -c TRIPLE_BACKTICKS /Users/exexporerporer/Projects/Grade-Sight/README.md
```
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add README.md
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Document Clerk dev-instance setup in README

Walks through Clerk dashboard setup, where to put pk_test_ and
sk_test_ keys, and the local dev flow. Also notes production Clerk
instance requirements (verified domain, pk_live_/sk_live_) for
future Railway deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Acceptance run (automated subset; full flow is user-driven)

**Files:** none — verification-only.

Subagents cannot do browser testing or create Clerk accounts. This task does the automated portion (clean install, build/typecheck/lint/test, unauthenticated 401 probe) and produces a clear manual-acceptance checklist for the user to run in their own browser.

- [ ] **Step 1: Clean-slate install**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
docker compose down -v
docker compose up -d db
sleep 12
pnpm install
pnpm db:migrate
```
Expected: fresh install succeeds, postinstall runs uv sync, migration applies (shows `Running upgrade ...` lines for both Spec 2 initial schema and Spec 3 clerk_org_id addition).

- [ ] **Step 2: Full verification suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
pnpm typecheck 2>&1 | tail -5 && echo "MARKER typecheck ok"
pnpm lint 2>&1 | tail -5 && echo "MARKER lint ok"
pnpm build 2>&1 | tail -10 && echo "MARKER build ok"
pnpm test 2>&1 | tail -5 && echo "MARKER test ok"
```

Expected: all four MARKER lines print.

- [ ] **Step 3: Boot + unauthenticated probes**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
pnpm dev > /tmp/gs-task11-dev.log 2>&1 &
DEV_PID=$!
sleep 18

echo "--- /api/health ---"
curl -s http://localhost:8000/api/health
echo ""
echo "--- /api/db-health ---"
curl -s http://localhost:8000/api/db-health
echo ""
echo "--- /api/me (no auth → 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8000/api/me
echo "--- web / ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
echo "--- web /sign-in ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/sign-in
echo "--- web /sign-up/parent ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/sign-up/parent
echo "--- web /sign-up/teacher ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/sign-up/teacher
echo "--- web /dashboard (no auth → redirect or 404, depending on middleware) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/dashboard

kill -TERM $DEV_PID 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
sleep 2
```

Expected responses:
- `/api/health` → `{"status":"ok","environment":"development"}`
- `/api/db-health` → `{"status":"ok","latency_ms":<n>}`
- `/api/me` → `HTTP 401`
- `/` → `HTTP 200`
- `/sign-in` → `HTTP 200`
- `/sign-up/parent` → `HTTP 200`
- `/sign-up/teacher` → `HTTP 200`
- `/dashboard` → `HTTP 307` or `308` (middleware redirect to `/sign-in`). If it returns 200, middleware isn't protecting — flag as a bug.

**IMPORTANT:** Steps 2 and 3 may fail if the user hasn't yet put real Clerk dev keys in `apps/web/.env.local` and `apps/api/.env`. With `sk_test_REPLACE_ME` placeholder values, `pnpm dev` will start but `/api/me` and any page invoking Clerk may fail. The subagent should note this to the user and skip forward — it's expected until the user populates the keys.

- [ ] **Step 4: Walk acceptance criteria (partial — automated only)**

Report each as PASS / FAIL / MANUAL (user must verify):

| # | Criterion | Category |
|---|---|---|
| 1 | Landing page has two CTAs | MANUAL (but `curl /` returning 200 + grep for "Sign up as parent" in the HTML suffices as auto-ish: `curl -s http://localhost:3000 \| grep "Sign up as parent"` after `pnpm dev` started) |
| 2 | Parent sign-up works end-to-end | MANUAL |
| 3 | Teacher sign-up + org auto-create | MANUAL (+ DB check: `docker exec ... psql ... "SELECT name, clerk_org_id FROM organizations LIMIT 5"`) |
| 4 | Sign-out works | MANUAL |
| 5 | Unauthenticated /dashboard redirects | AUTO — Step 3 shows HTTP 307/308 |
| 6 | /api/me returns 401 without JWT | AUTO — Step 3 shows HTTP 401 |
| 7 | Lazy upsert (new user inserted on first request) | MANUAL (+ DB check) |
| 8 | Role coercion logs warning on invalid metadata | MANUAL (would require injecting bad metadata) |
| 9 | Sign-in redirects to /dashboard | MANUAL |
| 10 | Migration reversible | AUTO — drift-check from Task 2 Step 7 |
| 11 | typecheck/lint/build/test pass | AUTO — Step 2 |
| 12 | @grade-sight/shared exports UserId + UserResponse | AUTO — grep from Task 6 |
| 13 | README has Clerk setup section | AUTO — grep `## Clerk authentication` in README |
| 14 | Deployed to Railway | DEFERRED — separate user action |

- [ ] **Step 5: Manual-acceptance checklist for the user**

Report the following as a final message to the user:

> **Automated portion complete. To finish acceptance you need to:**
>
> 1. Set up a Clerk development instance at https://clerk.com (see README → Clerk authentication section).
> 2. Replace `REPLACE_ME` in `apps/web/.env.local` and `apps/api/.env` with your real `pk_test_` / `sk_test_` keys.
> 3. Restart `pnpm dev`.
> 4. Open http://localhost:3000 in a browser.
> 5. Test the parent sign-up flow: click **Sign up as parent** → complete Clerk sign-up → confirm dashboard shows `Logged in as {your name} (parent)`. Sign out.
> 6. Test the teacher sign-up flow: click **Sign up as teacher** → complete Clerk sign-up → confirm dashboard shows `Logged in as {your name} (teacher)` with an org line. Sign out.
> 7. Query the DB to confirm the org row: `docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "SELECT name, clerk_org_id FROM organizations"` — should show one row per teacher-signup with `clerk_org_id` populated.
>
> If any flow fails, paste the error and we'll iterate.

**No commit in Task 11.** Verification + guidance only.

---

## Completion criteria (plan-level)

- Tasks 1–10 all committed individually to `main`.
- Step 3 in Task 11 shows all expected HTTP status codes.
- Manual-acceptance checklist delivered to the user.
- A separate manual pass by the user (using real Clerk dev keys) confirms the sign-up → dashboard loops work end-to-end.
- Deploy-to-Railway acceptance criterion is explicitly deferred to a separate post-implementation step.
