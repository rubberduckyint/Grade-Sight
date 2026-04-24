# Stripe Billing Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Stripe billing layer per `docs/superpowers/specs/2026-04-24-stripe-billing-integration-design.md` — subscriptions tied to `organization_id`, 30-day no-card trial auto-created on signup (both parents and teachers), denormalized entitlement status, signature-verified webhook dispatch with idempotency, and hosted-Checkout card collection.

**Architecture:** Clerk remains the identity layer; our DB owns business state; Stripe owns billing state. `services/stripe_service.py` wraps every Stripe API call. `services/entitlements.py` reads from the denormalized `organizations.subscription_status` column. The Spec 3 lazy upsert is extended so every new user gets a Clerk org + Stripe customer + trialing subscription row on first authenticated request. Webhook handler at `/api/webhooks/stripe` uses `subscription_events` table for idempotency.

**Tech Stack:** Stripe Python SDK, existing SQLAlchemy 2 async + Alembic + FastAPI + Pydantic v2 + `@clerk/nextjs` stack from Specs 1-3. Additions: Stripe dashboard products/prices (one-time manual), Stripe CLI for local webhook testing.

**No tests authored.** Per kickoff constraint. Verification at each task boundary is command-output based.

**Prerequisites before Task 14 manual acceptance:**
- Stripe account; both a Test-mode instance (required) and eventually a Live-mode instance.
- Two Products in Stripe test mode: "Parent Plan" and "Teacher Plan".
- Two recurring monthly prices: $15 for Parent, $25 for Teacher. Price IDs recorded.
- Stripe CLI installed (`brew install stripe/stripe-cli/stripe`, authenticated via `stripe login`) for forwarding webhooks to local api.

---

## Task 1: Dependencies + env config

**Files:**
- Modify: `apps/api/pyproject.toml`, `apps/api/uv.lock`
- Modify: `apps/api/src/grade_sight_api/config.py`
- Modify: `apps/api/.env.example`, `apps/api/.env` (gitignored — don't stage)
- Modify: `apps/web/env.ts`, `apps/web/.env.example`, `apps/web/.env.local` (gitignored — don't stage)

- [ ] **Step 1: Add `stripe` SDK to api**

Edit `/Users/exexporerporer/Projects/Grade-Sight/apps/api/pyproject.toml`. In the `dependencies` list, append:

```
"stripe>=11.0.0",
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
    "stripe>=11.0.0",
]
```

Sync:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv sync
```
Expected: stripe installed; `uv.lock` updates. If the version constraint doesn't resolve, try `>=10.0.0` or `>=7.0.0`.

- [ ] **Step 2: Extend `config.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/config.py`

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

    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_price_parent_monthly: str
    stripe_price_teacher_monthly: str


settings = Settings()  # type: ignore[call-arg]
```

- [ ] **Step 3: Update `apps/api/.env.example`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/.env.example`

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
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PARENT_MONTHLY=price_...
STRIPE_PRICE_TEACHER_MONTHLY=price_...

# Optional — defaults to DATABASE_URL with _test suffix if unset
TEST_DATABASE_URL=

# Future (uncomment when their spec lands):
# ANTHROPIC_API_KEY=
# SENTRY_DSN=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

- [ ] **Step 4: Update `apps/api/.env` (local)**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/.env`

Read the current file (has existing api + database + clerk vars). Append:
```
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_PARENT_MONTHLY=price_REPLACE_ME
STRIPE_PRICE_TEACHER_MONTHLY=price_REPLACE_ME
```

File is gitignored. **Do NOT stage.** User replaces `REPLACE_ME` placeholders with real Stripe test values before Task 14 manual acceptance.

- [ ] **Step 5: Extend `apps/web/env.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/env.ts`

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
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  },
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 6: Update `apps/web/.env.example`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/.env.example`

Overwrite with:
```
# Required
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Routing (fixed)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Future (uncomment when their spec lands):
# NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 7: Update `apps/web/.env.local` (local)**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/.env.local`

Read the current file. Append:
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_ME
```

File is gitignored. **Do NOT stage.**

- [ ] **Step 8: Verify imports + settings load**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "import stripe; print('stripe', stripe.VERSION)"
```
Expected: `stripe <version>` printed.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.main import app; print('app ok')"
```
Expected: `app ok`. If you see `ValidationError` for stripe_* fields, check that `apps/api/.env` has the four `STRIPE_*` lines from Step 4 (with `REPLACE_ME` placeholders is fine — Pydantic just needs non-empty strings).

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

Web typecheck:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web typecheck
```
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/api/pyproject.toml apps/api/uv.lock \
  apps/api/src/grade_sight_api/config.py \
  apps/api/.env.example \
  apps/web/env.ts apps/web/.env.example
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add Stripe SDK dep + Stripe/webhook env config

apps/api pyproject.toml adds stripe>=11.0.0. config.py extended with
four required fields: stripe_secret_key, stripe_webhook_secret,
stripe_price_parent_monthly, stripe_price_teacher_monthly. apps/web
env.ts adds NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — currently unused at
runtime (we use hosted Checkout) but pre-wired so future Elements work
doesn't need an env migration.

Local .env / .env.local updated with REPLACE_ME placeholders; user
fills in real Stripe test keys before Task 14 acceptance.

Per docs/superpowers/specs/2026-04-24-stripe-billing-integration-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Important:** `.env` and `.env.local` must NOT be in the commit. Verify with `git status` — neither should appear.

---

## Task 2: Schema + migration

**Files:**
- Modify: `apps/api/src/grade_sight_api/models/organization.py`
- Create: `apps/api/src/grade_sight_api/models/subscription.py`
- Create: `apps/api/src/grade_sight_api/models/subscription_event.py`
- Modify: `apps/api/src/grade_sight_api/models/__init__.py`
- Create: `apps/api/alembic/versions/0003_add_stripe_billing.py` (autogenerated, hand-reviewed)

- [ ] **Step 1: Write `subscription.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/subscription.py`

Content (exactly):
```python
"""Subscription model — one per organization, Stripe-backed.

stripe_subscription_id is NULL during the no-card trial phase (we track
trial_ends_at locally); it's populated once the user adds a card via
Stripe Checkout.
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin


class Plan(enum.StrEnum):
    parent_monthly = "parent_monthly"
    teacher_monthly = "teacher_monthly"


class SubscriptionStatus(enum.StrEnum):
    trialing = "trialing"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
    incomplete = "incomplete"


class Subscription(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (
        Index(
            "uq_subscriptions_stripe_subscription_id",
            "stripe_subscription_id",
            unique=True,
            postgresql_where=text("stripe_subscription_id IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    stripe_customer_id: Mapped[str] = mapped_column(nullable=False, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(nullable=True)
    plan: Mapped[Plan] = mapped_column(SAEnum(Plan, name="plan"), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(SubscriptionStatus, name="subscription_status"),
        nullable=False,
        index=True,
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(nullable=True, index=True)
    current_period_end: Mapped[datetime | None] = mapped_column(nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        nullable=False,
        server_default=text("false"),
    )
```

- [ ] **Step 2: Write `subscription_event.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/subscription_event.py`

Content (exactly):
```python
"""SubscriptionEvent — append-only webhook receipts for idempotency.

processed_at is NULL until the handler succeeds. If the handler raises,
we leave processed_at NULL and return 500 so Stripe retries.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base


class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    stripe_event_id: Mapped[str] = mapped_column(unique=True, nullable=False)
    event_type: Mapped[str] = mapped_column(nullable=False, index=True)
    subscription_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
        index=True,
    )
```

- [ ] **Step 3: Update `organization.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/organization.py`

Overwrite with:
```python
"""Organization model — top-level tenant. Nullable FK for parent-mode users."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin
from .subscription import SubscriptionStatus


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
    clerk_org_id: Mapped[str | None] = mapped_column(
        unique=True,
        nullable=True,
    )
    # Denormalized from subscriptions.status for fast entitlement reads.
    # Maintained by webhook handlers and the extended lazy upsert.
    subscription_status: Mapped[SubscriptionStatus | None] = mapped_column(
        SAEnum(SubscriptionStatus, name="subscription_status"),
        nullable=True,
    )
```

Note: `SubscriptionStatus` is imported from `subscription.py`. The Postgres enum is defined there; here we reuse the same enum type (`SAEnum(..., name="subscription_status")`). SQLAlchemy will recognize it's the same type and NOT emit a duplicate CREATE TYPE.

- [ ] **Step 4: Update `models/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/__init__.py`

Overwrite with:
```python
"""Grade-Sight ORM models.

Re-exports every model so Alembic autogenerate can discover them by
importing this module once.
"""

from .answer_key import AnswerKey
from .assessment import Assessment, AssessmentStatus
from .audit_log import AuditLog
from .class_member import ClassMember
from .klass import Klass
from .llm_call_log import LLMCallLog
from .organization import Organization
from .student import Student
from .student_profile import StudentProfile
from .subscription import Plan, Subscription, SubscriptionStatus
from .subscription_event import SubscriptionEvent
from .user import User, UserRole

__all__ = [
    "AnswerKey",
    "Assessment",
    "AssessmentStatus",
    "AuditLog",
    "ClassMember",
    "Klass",
    "LLMCallLog",
    "Organization",
    "Plan",
    "Student",
    "StudentProfile",
    "Subscription",
    "SubscriptionEvent",
    "SubscriptionStatus",
    "User",
    "UserRole",
]
```

- [ ] **Step 5: Verify imports**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api import models; print(len(models.__all__))"
```
Expected: prints `15`.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 6: Confirm DB is up and at prior head**

```bash
docker compose -f /Users/exexporerporer/Projects/Grade-Sight/compose.yaml ps
```
Expected: `db` healthy.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic current
```
Expected: shows `f7ad39986104 (head)` (Spec 3's clerk_org_id migration).

If the DB is empty (migrations not applied), run `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm db:migrate` to get to head first.

- [ ] **Step 7: Autogenerate the migration**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic revision --autogenerate -m "add stripe billing"
```
Expected: creates `alembic/versions/<timestamp>_add_stripe_billing.py` with:
- `op.create_table('subscriptions', ...)` with an index on `stripe_subscription_id WHERE NOT NULL`
- `op.create_table('subscription_events', ...)`
- `op.add_column('organizations', sa.Column('subscription_status', ...))`
- `op.create_type` or inline Enum type creation for `plan` enum (new) and possibly for `subscription_status` if not already seen

- [ ] **Step 8: Review the generated migration**

Read the new file. Verify:
- `subscriptions` table has all columns from Section 2 of the spec.
- `subscription_events` table has all columns.
- `organizations.subscription_status` column is added (nullable).
- `plan` enum type is created.
- `subscription_status` enum type is created (used by both `subscriptions.status` and `organizations.subscription_status`).
- `downgrade()` reverses everything in correct order (drop column, drop tables, drop types).

**If the migration tries to re-create an enum type that already exists** (rare but possible if the autogenerate logic gets confused), add `create_type=False` on one of the `SAEnum()` references in the migration. Common fix pattern:
```python
# If autogenerate emits: sa.Enum('trialing', ..., name='subscription_status')
# Change to:           sa.Enum('trialing', ..., name='subscription_status', create_type=False)
# On the SECOND reference, not the first.
```

If any other extraneous operations appear, report DONE_WITH_CONCERNS.

- [ ] **Step 9: Apply the migration**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic upgrade head
```
Expected: prints `Running upgrade f7ad39986104 -> <new_rev>, add stripe billing`.

- [ ] **Step 10: Verify schema**

```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\dt" | grep -E "subscription"
```
Expected: two rows — `subscriptions`, `subscription_events`.

```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\dT" | grep -E "plan|subscription_status"
```
Expected: both enum types listed.

```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\d organizations" | grep subscription_status
```
Expected: `subscription_status` row with type `subscription_status`.

- [ ] **Step 11: Drift check**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic revision --autogenerate -m "drift check"
```

Open the new file; confirm `upgrade()` body is empty (just `pass`). Delete it:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api/alembic/versions
LATEST=$(ls -t | grep -v ".gitkeep" | head -1)
rm "$LATEST"
```

- [ ] **Step 12: Verify downgrade reversibility**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic downgrade -1 && \
  uv run alembic upgrade head
```
Expected: downgrade then upgrade both succeed.

- [ ] **Step 13: Verify mypy + lint**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 14: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/api/src/grade_sight_api/models \
  apps/api/alembic/versions
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add Subscription + SubscriptionEvent models + migration

Two new tables: subscriptions (one row per org, FK unique) and
subscription_events (append-only webhook idempotency store, stripe_event_id
unique). organizations gets a denormalized subscription_status column
that the webhook handler updates in lockstep with subscriptions.status —
entitlement reads hit the indexed org column, no join required.

Two new Postgres enums: plan (parent_monthly, teacher_monthly) and
subscription_status (trialing, active, past_due, canceled, incomplete).

Migration verified reversible and drift-free.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Stripe service

**Files:**
- Create: `apps/api/src/grade_sight_api/services/stripe_service.py`
- Modify: `apps/api/src/grade_sight_api/services/__init__.py`

- [ ] **Step 1: Update `services/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/services/__init__.py`

Overwrite with:
```python
"""External service abstraction layer.

Wraps third-party APIs (Stripe today; Claude + S3 in future specs) so
the surrounding code calls thin, audit-logged helpers rather than the
raw SDKs.
"""
```

- [ ] **Step 2: Write `stripe_service.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/services/stripe_service.py`

Content (exactly):
```python
"""Stripe SDK wrapper — every Stripe API call goes through here.

Each function logs to Python's logging module (INFO) and writes an
audit_log entry for user-visible state changes. Raw API call tracking
(a stripe_api_calls table analog to llm_call_logs) is deferred.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.audit_log import AuditLog
from ..models.organization import Organization
from ..models.subscription import Plan, Subscription

logger = logging.getLogger(__name__)

# Initialize Stripe with our secret key at module import.
stripe.api_key = settings.stripe_secret_key


def _price_id_for_plan(plan: Plan) -> str:
    """Map our Plan enum to the env-configured Stripe price ID."""
    if plan == Plan.parent_monthly:
        return settings.stripe_price_parent_monthly
    if plan == Plan.teacher_monthly:
        return settings.stripe_price_teacher_monthly
    raise ValueError(f"No Stripe price configured for plan: {plan}")


async def _write_audit_log(
    db: AsyncSession,
    *,
    organization_id: UUID,
    action: str,
    event_metadata: dict[str, Any],
) -> None:
    """Insert an audit_log row for a Stripe-related state change."""
    entry = AuditLog(
        organization_id=organization_id,
        user_id=None,  # Stripe service is org-scoped, not user-scoped
        resource_type="subscription",
        resource_id=None,
        action=action,
        event_metadata=event_metadata,
    )
    db.add(entry)
    await db.flush()


async def create_customer(
    email: str,
    organization_id: UUID,
    db: AsyncSession,
) -> stripe.Customer:
    """Create a Stripe customer for an organization.

    Logs the call, writes audit_log, returns the created customer object.
    """
    logger.info("stripe.customers.create org=%s email=%s", organization_id, email)
    customer = await stripe.Customer.create_async(
        email=email,
        metadata={"organization_id": str(organization_id)},
    )
    await _write_audit_log(
        db,
        organization_id=organization_id,
        action="stripe_customer_created",
        event_metadata={"stripe_customer_id": customer.id, "email": email},
    )
    return customer


async def create_checkout_session(
    organization_id: UUID,
    plan: Plan,
    db: AsyncSession,
    success_url: str,
    cancel_url: str,
) -> stripe.checkout.Session:
    """Create a hosted Checkout session for adding a card during trial.

    The Checkout session is a one-time URL the user visits in their browser
    to enter card details on Stripe's hosted page.
    """
    sub = await _get_subscription(db, organization_id)
    if sub is None:
        raise RuntimeError(
            f"Cannot create checkout session: no subscription for org {organization_id}"
        )

    logger.info(
        "stripe.checkout.Session.create org=%s customer=%s plan=%s",
        organization_id,
        sub.stripe_customer_id,
        plan,
    )
    session = await stripe.checkout.Session.create_async(
        customer=sub.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": _price_id_for_plan(plan), "quantity": 1}],
        subscription_data={
            "trial_end": int(sub.trial_ends_at.timestamp())
            if sub.trial_ends_at is not None
            else None,
        },
        success_url=success_url,
        cancel_url=cancel_url,
    )
    await _write_audit_log(
        db,
        organization_id=organization_id,
        action="stripe_checkout_session_started",
        event_metadata={
            "session_id": session.id,
            "plan": plan.value,
        },
    )
    return session


async def create_customer_portal_session(
    organization_id: UUID,
    db: AsyncSession,
    return_url: str,
) -> stripe.billing_portal.Session:
    """Create a Customer Portal session for self-service billing."""
    sub = await _get_subscription(db, organization_id)
    if sub is None:
        raise RuntimeError(
            f"Cannot create portal session: no subscription for org {organization_id}"
        )

    logger.info(
        "stripe.billing_portal.Session.create org=%s customer=%s",
        organization_id,
        sub.stripe_customer_id,
    )
    session = await stripe.billing_portal.Session.create_async(
        customer=sub.stripe_customer_id,
        return_url=return_url,
    )
    return session


def verify_webhook_signature(payload: bytes, signature: str) -> stripe.Event:
    """Verify a webhook signature and return the parsed event.

    Raises stripe.SignatureVerificationError on invalid signatures.
    """
    return stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=settings.stripe_webhook_secret,
    )


async def _get_subscription(
    db: AsyncSession,
    organization_id: UUID,
) -> Subscription | None:
    """Fetch the subscription row for an org (internal helper)."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
```

- [ ] **Step 3: Verify imports**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.services import stripe_service; print('ok', stripe_service.create_customer.__name__)"
```
Expected: `ok create_customer`.

**If stripe SDK doesn't have `create_async` methods** — older Stripe Python SDK versions (pre-11.0) used `stripe.Customer.create()` synchronously. If mypy complains about `create_async`, two options:
- Confirm your `stripe` version is recent: `uv run python -c "import stripe; print(stripe.VERSION)"` — should be 11.x or higher.
- If it's older, either bump the pyproject.toml pin to `stripe>=11.0.0` and re-sync, OR change all `create_async(...)` to sync `create(...)` calls and wrap with `await asyncio.to_thread(...)`.

- [ ] **Step 4: mypy + lint**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass. Stripe's type stubs may generate a few complaints — acceptable to add narrow `# type: ignore` comments where needed, but prefer ignore-free if possible.

- [ ] **Step 5: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/services
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add stripe_service — SDK wrapper with audit logging

services/stripe_service.py wraps all Stripe API calls: create_customer,
create_checkout_session, create_customer_portal_session, and
verify_webhook_signature. Each function logs to Python logging and
writes audit_log entries for user-visible state changes. No other
module imports stripe directly — this is the single boundary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Entitlements service

**Files:**
- Create: `apps/api/src/grade_sight_api/services/entitlements.py`

- [ ] **Step 1: Write `entitlements.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/services/entitlements.py`

Content (exactly):
```python
"""Entitlement helpers.

has_active_subscription is the single entry point every future gated
feature calls. It reads from the denormalized organizations.subscription_status
column — no Stripe call, no join, no cache. Webhook handlers are
responsible for keeping that column in sync.

reconcile_subscription pulls fresh state from Stripe and overwrites our
rows. Used for explicit drift repair (admin endpoint and nightly cron,
both deferred to later specs).
"""

from __future__ import annotations

import logging
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.organization import Organization
from ..models.subscription import Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)

_ENTITLED_STATUSES: frozenset[SubscriptionStatus] = frozenset(
    {
        SubscriptionStatus.trialing,
        SubscriptionStatus.active,
        SubscriptionStatus.past_due,
    }
)


async def has_active_subscription(
    organization_id: UUID,
    db: AsyncSession,
) -> bool:
    """Return True if the org has an entitled subscription status.

    Reads organizations.subscription_status. past_due is entitled — Stripe's
    smart retries handle the dunning window; a terminal canceled transition
    arrives via webhook and flips the answer to False.
    """
    result = await db.execute(
        select(Organization.subscription_status).where(
            Organization.id == organization_id,
        )
    )
    status = result.scalar_one_or_none()
    return status in _ENTITLED_STATUSES


async def reconcile_subscription(
    organization_id: UUID,
    db: AsyncSession,
) -> Subscription | None:
    """Pull fresh state from Stripe and overwrite our rows.

    Only acts if our subscription row has a stripe_subscription_id (i.e.,
    the user has already added a card — pre-card trial state is locally
    maintained).

    Returns the updated Subscription, or None if no subscription row exists.
    """
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return None
    if sub.stripe_subscription_id is None:
        # Still in pre-card trial; Stripe has nothing to reconcile with.
        return sub

    stripe_sub = await stripe.Subscription.retrieve_async(sub.stripe_subscription_id)
    logger.info(
        "reconcile org=%s stripe_status=%s local_status=%s",
        organization_id,
        stripe_sub.status,
        sub.status.value,
    )
    new_status = SubscriptionStatus(stripe_sub.status)
    sub.status = new_status
    sub.current_period_end = stripe_sub.current_period_end  # type: ignore[assignment]
    sub.cancel_at_period_end = stripe_sub.cancel_at_period_end

    # Denormalize to organization
    org_result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    org = org_result.scalar_one_or_none()
    if org is not None:
        org.subscription_status = new_status

    await db.flush()
    return sub
```

- [ ] **Step 2: Verify imports + checks**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.services.entitlements import has_active_subscription, reconcile_subscription; print('ok')"
```
Expected: `ok`.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/services/entitlements.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add entitlements service — has_active_subscription + reconcile_subscription

services/entitlements.has_active_subscription reads from the denormalized
organizations.subscription_status column — fast path, no Stripe call. Used
by every future gated feature.

reconcile_subscription pulls fresh state from Stripe and overwrites our
rows (and the denormalized org column). Drift repair; called manually today,
will be wired to a nightly cron later.

past_due is entitled; we let Stripe's dunning flow land a canceled webhook
when they give up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Response schemas + billing router

**Files:**
- Create: `apps/api/src/grade_sight_api/schemas/billing.py`
- Create: `apps/api/src/grade_sight_api/routers/billing.py`

- [ ] **Step 1: Write `schemas/billing.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/schemas/billing.py`

Content (exactly):
```python
"""Response schemas for /api/me/entitlement and /api/billing/* endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from ..models.subscription import Plan, SubscriptionStatus


class EntitlementResponse(BaseModel):
    """Returned by GET /api/me/entitlement for frontend UI state."""

    status: SubscriptionStatus | None
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    plan: Plan | None
    is_entitled: bool
    model_config = ConfigDict(from_attributes=True)


class CheckoutSessionResponse(BaseModel):
    """Returned by POST /api/billing/checkout."""

    url: str


class PortalSessionResponse(BaseModel):
    """Returned by POST /api/billing/portal."""

    url: str
```

- [ ] **Step 2: Write `routers/billing.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers/billing.py`

Content (exactly):
```python
"""Authenticated billing endpoints: entitlement, checkout, customer portal."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..config import settings
from ..db import get_session
from ..models.subscription import Subscription, SubscriptionStatus
from ..models.user import User
from ..schemas.billing import (
    CheckoutSessionResponse,
    EntitlementResponse,
    PortalSessionResponse,
)
from ..services import stripe_service

router = APIRouter()

_ENTITLED_STATUSES: frozenset[SubscriptionStatus] = frozenset(
    {
        SubscriptionStatus.trialing,
        SubscriptionStatus.active,
        SubscriptionStatus.past_due,
    }
)


@router.get("/api/me/entitlement", response_model=EntitlementResponse)
async def entitlement(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> EntitlementResponse:
    """Return the current user's entitlement state."""
    if user.organization_id is None:
        # Should not happen after Spec 4 (both parents and teachers get orgs).
        return EntitlementResponse(
            status=None,
            trial_ends_at=None,
            current_period_end=None,
            plan=None,
            is_entitled=False,
        )

    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == user.organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return EntitlementResponse(
            status=None,
            trial_ends_at=None,
            current_period_end=None,
            plan=None,
            is_entitled=False,
        )

    return EntitlementResponse(
        status=sub.status,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
        plan=sub.plan,
        is_entitled=sub.status in _ENTITLED_STATUSES,
    )


@router.post("/api/billing/checkout", response_model=CheckoutSessionResponse)
async def checkout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> CheckoutSessionResponse:
    """Create a Stripe Checkout session for adding a card to the trial."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no organization",
        )

    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == user.organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization has no subscription",
        )

    success_url = f"{settings.cors_origin}/settings/billing?checkout=success"
    cancel_url = f"{settings.cors_origin}/settings/billing?checkout=cancel"

    session = await stripe_service.create_checkout_session(
        organization_id=user.organization_id,
        plan=sub.plan,
        db=db,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return CheckoutSessionResponse(url=session.url)


@router.post("/api/billing/portal", response_model=PortalSessionResponse)
async def portal(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> PortalSessionResponse:
    """Create a Stripe Customer Portal session for self-service billing."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no organization",
        )

    return_url = f"{settings.cors_origin}/settings/billing"
    session = await stripe_service.create_customer_portal_session(
        organization_id=user.organization_id,
        db=db,
        return_url=return_url,
    )
    return PortalSessionResponse(url=session.url)
```

- [ ] **Step 3: Update per-file-ignores for B008**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/pyproject.toml`

Find the `[tool.ruff.lint.per-file-ignores]` block and add an entry for `billing.py`. The block should end up looking like:
```toml
[tool.ruff.lint.per-file-ignores]
"src/grade_sight_api/main.py" = ["B008"]
"src/grade_sight_api/auth/dependencies.py" = ["B008"]
"src/grade_sight_api/routers/me.py" = ["B008"]
"src/grade_sight_api/routers/billing.py" = ["B008"]
```

- [ ] **Step 4: Verify**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.routers.billing import router; print([r.path for r in router.routes])"
```
Expected: list includes `/api/me/entitlement`, `/api/billing/checkout`, `/api/billing/portal`.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/api/src/grade_sight_api/schemas/billing.py \
  apps/api/src/grade_sight_api/routers/billing.py \
  apps/api/pyproject.toml
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add billing router: /api/me/entitlement, /api/billing/checkout, /api/billing/portal

schemas/billing.py defines EntitlementResponse (includes is_entitled
convenience bool), CheckoutSessionResponse, PortalSessionResponse.
routers/billing.py wires all three endpoints behind get_current_user.
Checkout + Portal return Stripe URLs for the frontend to redirect to;
success/cancel/return URLs are built from CORS_ORIGIN + /settings/billing.

B008 ignore added for billing.py to match the existing FastAPI Depends
pattern suppressions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Webhook handler

**Files:**
- Create: `apps/api/src/grade_sight_api/routers/webhooks/__init__.py`
- Create: `apps/api/src/grade_sight_api/routers/webhooks/stripe.py`

- [ ] **Step 1: Create webhooks directory**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers/webhooks
```

- [ ] **Step 2: Write `webhooks/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers/webhooks/__init__.py`

Content:
```python
"""Inbound webhook routers (Stripe today; Clerk in future if we switch from lazy upsert)."""
```

- [ ] **Step 3: Write `webhooks/stripe.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/routers/webhooks/stripe.py`

Content (exactly):
```python
"""POST /api/webhooks/stripe — Stripe webhook receiver with idempotency."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import get_session
from ...models.audit_log import AuditLog
from ...models.organization import Organization
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.subscription_event import SubscriptionEvent
from ...services import stripe_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Receive and dispatch Stripe webhook events.

    Idempotent via subscription_events (unique stripe_event_id). Signature
    verification is non-negotiable — unsigned/forged requests return 400.
    """
    if stripe_signature is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )

    payload = await request.body()
    try:
        event = stripe_service.verify_webhook_signature(payload, stripe_signature)
    except (stripe.SignatureVerificationError, ValueError) as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        ) from exc

    # Idempotency: return 200 if we've already seen this event.
    existing = await db.execute(
        select(SubscriptionEvent).where(
            SubscriptionEvent.stripe_event_id == event.id
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.info("Duplicate Stripe webhook (id=%s type=%s), skipping", event.id, event.type)
        return {"received": "duplicate"}

    # Record the event row up front; processed_at stays null until dispatch succeeds.
    event_row = SubscriptionEvent(
        stripe_event_id=event.id,
        event_type=event.type,
        subscription_id=None,
        payload=event.to_dict(),
        processed_at=None,
    )
    db.add(event_row)
    await db.flush()

    # Dispatch
    try:
        await _dispatch(event, db, event_row)
    except Exception as exc:
        logger.exception("Stripe webhook handler failed: event_id=%s type=%s", event.id, event.type)
        # Leave processed_at null so Stripe retries.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"handler failed: {exc.__class__.__name__}",
        ) from exc

    event_row.processed_at = datetime.now(UTC)
    await db.flush()
    return {"received": "ok"}


async def _dispatch(event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent) -> None:
    """Route a Stripe event to its handler."""
    handler = _HANDLERS.get(event.type)
    if handler is None:
        logger.info("Unhandled Stripe event type: %s", event.type)
        return
    await handler(event, db, event_row)


async def _handle_subscription_created(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.created — link stripe_subscription_id to our row."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        logger.warning(
            "customer.subscription.created: no local subscription for customer=%s",
            stripe_sub["customer"],
        )
        return
    sub.stripe_subscription_id = stripe_sub["id"]
    sub.current_period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=UTC)
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)
    event_row.subscription_id = sub.id
    await _write_state_audit(db, sub, "stripe_subscription_linked", event.id)


async def _handle_subscription_updated(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.updated — status change, period rollover, cancel-at-period-end, etc."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        logger.warning(
            "customer.subscription.updated: no local subscription for customer=%s",
            stripe_sub["customer"],
        )
        return
    new_status = SubscriptionStatus(stripe_sub["status"])
    sub.status = new_status
    sub.current_period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=UTC)
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)
    event_row.subscription_id = sub.id
    await _denormalize_org_status(db, sub.organization_id, new_status)
    await _write_state_audit(db, sub, f"subscription_{new_status.value}", event.id)


async def _handle_subscription_deleted(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.deleted — subscription fully removed on Stripe side."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        return
    sub.status = SubscriptionStatus.canceled
    event_row.subscription_id = sub.id
    await _denormalize_org_status(db, sub.organization_id, SubscriptionStatus.canceled)
    await _write_state_audit(db, sub, "subscription_canceled", event.id)


async def _handle_payment_succeeded(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """invoice.payment_succeeded — log and audit."""
    invoice = event.data["object"]
    customer_id = invoice.get("customer")
    sub = (
        await _find_subscription_by_customer(db, customer_id)
        if customer_id
        else None
    )
    if sub is not None:
        event_row.subscription_id = sub.id
        await _write_state_audit(
            db,
            sub,
            "payment_succeeded",
            event.id,
            extra={"invoice_id": invoice.get("id"), "amount_paid": invoice.get("amount_paid")},
        )


async def _handle_payment_failed(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """invoice.payment_failed — mark past_due + audit."""
    invoice = event.data["object"]
    customer_id = invoice.get("customer")
    sub = (
        await _find_subscription_by_customer(db, customer_id)
        if customer_id
        else None
    )
    if sub is None:
        return
    sub.status = SubscriptionStatus.past_due
    event_row.subscription_id = sub.id
    await _denormalize_org_status(db, sub.organization_id, SubscriptionStatus.past_due)
    await _write_state_audit(
        db,
        sub,
        "payment_failed",
        event.id,
        extra={"invoice_id": invoice.get("id")},
    )


async def _handle_trial_will_end(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.trial_will_end — no-op now; audit for future email spec."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        return
    event_row.subscription_id = sub.id
    await _write_state_audit(db, sub, "trial_ending_soon_signal_received", event.id)


_HANDLERS: dict[str, Any] = {
    "customer.subscription.created": _handle_subscription_created,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
    "invoice.payment_succeeded": _handle_payment_succeeded,
    "invoice.payment_failed": _handle_payment_failed,
    "customer.subscription.trial_will_end": _handle_trial_will_end,
}


async def _find_subscription_by_customer(
    db: AsyncSession, stripe_customer_id: str
) -> Subscription | None:
    result = await db.execute(
        select(Subscription).where(
            Subscription.stripe_customer_id == stripe_customer_id,
            Subscription.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _denormalize_org_status(
    db: AsyncSession, organization_id, new_status: SubscriptionStatus
) -> None:
    """Mirror subscriptions.status into organizations.subscription_status."""
    result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    org = result.scalar_one_or_none()
    if org is not None:
        org.subscription_status = new_status


async def _write_state_audit(
    db: AsyncSession,
    sub: Subscription,
    action: str,
    stripe_event_id: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Record a state change to audit_log."""
    metadata: dict[str, Any] = {
        "subscription_id": str(sub.id),
        "stripe_event_id": stripe_event_id,
        "status": sub.status.value,
    }
    if extra is not None:
        metadata.update(extra)
    entry = AuditLog(
        organization_id=sub.organization_id,
        user_id=None,
        resource_type="subscription",
        resource_id=sub.id,
        action=action,
        event_metadata=metadata,
    )
    db.add(entry)
    await db.flush()
```

- [ ] **Step 4: Add B008 ignore for webhook handler**

Edit `apps/api/pyproject.toml`. Add to the `[tool.ruff.lint.per-file-ignores]` block:
```toml
"src/grade_sight_api/routers/webhooks/stripe.py" = ["B008"]
```

Final block should have five entries (main, dependencies, me, billing, webhooks/stripe).

- [ ] **Step 5: Verify imports + types**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.routers.webhooks.stripe import router; print([r.path for r in router.routes])"
```
Expected: list includes `/api/webhooks/stripe`.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/api/src/grade_sight_api/routers/webhooks \
  apps/api/pyproject.toml
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add Stripe webhook handler with signature verification + idempotency

routers/webhooks/stripe.py receives all Stripe webhook POSTs. Verifies
signatures via stripe_service, dedupes via subscription_events
(unique stripe_event_id), dispatches to per-event-type handlers:

- customer.subscription.created: link stripe_subscription_id
- customer.subscription.updated: update status + denormalize to org
- customer.subscription.deleted: canceled + denormalize
- invoice.payment_succeeded: audit log
- invoice.payment_failed: past_due + denormalize
- customer.subscription.trial_will_end: no-op audit (email spec hook)

Handler exceptions leave processed_at null so Stripe retries. Unknown
event types return 200 and are ignored.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extended lazy upsert

**Files:**
- Modify: `apps/api/src/grade_sight_api/auth/dependencies.py`

- [ ] **Step 1: Overwrite `auth/dependencies.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/auth/dependencies.py`

Overwrite with (exactly):
```python
"""FastAPI authentication dependencies.

get_current_user:
  - Verifies the Clerk session token from request headers.
  - Lazily upserts the user row in our DB on first authenticated request.
  - For BOTH parent and teacher roles on first request: auto-creates a Clerk
    org + our organizations row + Stripe customer + trialing subscriptions
    row + denormalizes organizations.subscription_status.
  - Returns the live User ORM instance.

Role security: unsafeMetadata.role is user-controllable. We accept only
{parent, teacher}; any other value (including admin) coerces to parent.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from clerk_backend_api.models.createorganizationop import CreateOrganizationRequestBody
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.organization import Organization
from ..models.subscription import Plan, Subscription, SubscriptionStatus
from ..models.user import User, UserRole
from ..services import stripe_service
from .clerk import clerk_client, verify_request_auth

logger = logging.getLogger(__name__)


def _normalize_role(raw: object) -> UserRole:
    """Coerce a Clerk metadata role value into a safe UserRole.

    Anything that isn't 'teacher' or 'parent' becomes 'parent'. Admin role is
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


def _default_org_name(
    role: UserRole,
    first_name: str | None,
    last_name: str | None,
    email: str,
) -> str:
    """Build the default auto-created org name.

    Parent: '{First Last}'s Family'
    Teacher: '{First Last}'s Classroom'
    Fallback: '{email-local}'s {Family|Classroom}' when names missing.
    """
    suffix = "Classroom" if role == UserRole.teacher else "Family"
    parts = [p for p in (first_name, last_name) if p]
    if parts:
        return f"{' '.join(parts)}'s {suffix}"
    local = email.split("@")[0] if "@" in email else email
    return f"{local}'s {suffix}"


def _plan_for_role(role: UserRole) -> Plan:
    """Map a user role to their default subscription plan."""
    if role == UserRole.teacher:
        return Plan.teacher_monthly
    return Plan.parent_monthly


def _extract_primary_email(clerk_user: Any) -> str:
    """Return the primary email address string from a Clerk user object."""
    primary_id = getattr(clerk_user, "primary_email_address_id", None) or getattr(
        clerk_user, "primaryEmailAddressId", None
    )
    addresses = (
        getattr(clerk_user, "email_addresses", None)
        or getattr(clerk_user, "emailAddresses", None)
        or []
    )
    for addr in addresses:
        addr_id = getattr(addr, "id", None)
        if addr_id == primary_id:
            value = getattr(addr, "email_address", None) or getattr(
                addr, "emailAddress", None
            )
            if value:
                return str(value)
    if addresses:
        first = addresses[0]
        value = getattr(first, "email_address", None) or getattr(
            first, "emailAddress", None
        )
        if value:
            return str(value)
    return ""


def _extract_unsafe_metadata(clerk_user: Any) -> dict[str, Any]:
    meta = getattr(clerk_user, "unsafe_metadata", None)
    if meta is None:
        meta = getattr(clerk_user, "unsafeMetadata", None)
    if isinstance(meta, dict):
        return meta
    return {}


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    """Verify Clerk session and return (or lazily create) the matching User row."""
    headers = dict(request.headers)
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

    clerk_user = clerk_client.users.get(user_id=clerk_user_id)

    email = _extract_primary_email(clerk_user)
    first_name = getattr(clerk_user, "first_name", None) or getattr(
        clerk_user, "firstName", None
    )
    last_name = getattr(clerk_user, "last_name", None) or getattr(
        clerk_user, "lastName", None
    )

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

    # ─── New user: create Clerk org + DB org + Stripe customer + trial sub + user row ───

    unsafe_meta = _extract_unsafe_metadata(clerk_user)
    role = _normalize_role(unsafe_meta.get("role"))
    org_name = _default_org_name(role, first_name, last_name, email)
    plan = _plan_for_role(role)

    # 1. Create Clerk org (for both parent and teacher now)
    clerk_org = clerk_client.organizations.create(
        request=CreateOrganizationRequestBody(name=org_name, created_by=clerk_user_id)
    )
    clerk_org_id = getattr(clerk_org, "id", None)

    # 2. Insert our organizations row
    new_org = Organization(
        name=org_name,
        clerk_org_id=str(clerk_org_id) if clerk_org_id else None,
    )
    db.add(new_org)
    await db.flush()  # populate new_org.id

    # 3. Create Stripe customer via service layer (writes audit log)
    stripe_customer = await stripe_service.create_customer(
        email=email,
        organization_id=new_org.id,
        db=db,
    )

    # 4. Insert subscription row: trialing, trial ends in 30 days, no stripe_subscription_id yet
    trial_ends_at = datetime.now(UTC) + timedelta(days=30)
    new_sub = Subscription(
        organization_id=new_org.id,
        stripe_customer_id=stripe_customer.id,
        stripe_subscription_id=None,
        plan=plan,
        status=SubscriptionStatus.trialing,
        trial_ends_at=trial_ends_at,
        current_period_end=None,
        cancel_at_period_end=False,
    )
    db.add(new_sub)

    # 5. Denormalize subscription status onto organization
    new_org.subscription_status = SubscriptionStatus.trialing

    # 6. Insert users row
    new_user = User(
        clerk_id=clerk_user_id,
        email=email,
        role=role,
        first_name=first_name,
        last_name=last_name,
        organization_id=new_org.id,
    )
    db.add(new_user)
    await db.flush()

    logger.info(
        "Lazy upsert created org=%s user=%s role=%s plan=%s",
        new_org.id,
        new_user.id,
        role.value,
        plan.value,
    )
    return new_user
```

- [ ] **Step 2: Verify imports + types**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.auth.dependencies import get_current_user; print('ok')"
```
Expected: `ok`.

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/auth/dependencies.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Extend lazy upsert for Stripe + parent orgs (breaks Spec 3 'parents have no org')

The new-user branch of get_current_user now applies to BOTH parent and
teacher roles:
1. Create Clerk org (parent or teacher — name differs by role).
2. INSERT organizations row with clerk_org_id.
3. stripe_service.create_customer() — creates Stripe customer + audit log.
4. INSERT subscriptions row (trialing, trial_ends_at now+30d,
   stripe_subscription_id=null until card added).
5. Denormalize organizations.subscription_status = trialing.
6. INSERT users row with the new organization_id.

Default org name: '{First Last}'s Classroom' (teacher) or
'{First Last}'s Family' (parent). Email-local-part fallback when names
missing.

Superseds Spec 3's rule that parents have organization_id=NULL. The
test DB was wiped before starting this spec, so no data migration
needed. Production Railway DB is being wiped as a separate prerequisite.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: main.py wire-up

**Files:**
- Modify: `apps/api/src/grade_sight_api/main.py`

- [ ] **Step 1: Overwrite `main.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/main.py`

Overwrite with (exactly):
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
from .routers import billing as billing_router
from .routers import me as me_router
from .routers.webhooks import stripe as stripe_webhook_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Dispose of the async engine cleanly on shutdown."""
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="Grade-Sight API", version="0.0.0", lifespan=lifespan)

app.include_router(me_router.router)
app.include_router(billing_router.router)
app.include_router(stripe_webhook_router.router)


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

- [ ] **Step 2: Verify routes**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.main import app; print(sorted(r.path for r in app.routes))"
```
Expected: includes `/api/health`, `/api/db-health`, `/api/me`, `/api/me/entitlement`, `/api/billing/checkout`, `/api/billing/portal`, `/api/webhooks/stripe`.

Boot probe — check /api/me/entitlement returns 401 without auth:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run uvicorn grade_sight_api.main:app --port 8003 > /tmp/gs-task8-uvicorn.log 2>&1 &
API_PID=$!
sleep 4
echo "--- /api/me/entitlement (no auth → 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8003/api/me/entitlement
echo "--- /api/billing/checkout (no auth → 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:8003/api/billing/checkout
echo "--- /api/webhooks/stripe (no signature → 400) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:8003/api/webhooks/stripe -d "{}"
kill $API_PID 2>/dev/null || true
sleep 1
```

Expected:
```
--- /api/me/entitlement (no auth → 401) ---
HTTP 401
--- /api/billing/checkout (no auth → 401) ---
HTTP 401
--- /api/webhooks/stripe (no signature → 400) ---
HTTP 400
```

If webhook returns 500 instead of 400, check stripe_service.verify_webhook_signature — it may be raising a ValueError before signature check. Fine if handled; the dispatch should still return 400.

- [ ] **Step 3: mypy + lint**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src && uv run ruff check
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/main.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Include billing + stripe webhook routers in main

main.py now mounts three authenticated billing endpoints
(/api/me/entitlement, /api/billing/checkout, /api/billing/portal)
and the unauthenticated /api/webhooks/stripe webhook handler.
Public health endpoints unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend api helpers + env

**Files:**
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Overwrite `lib/api.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/lib/api.ts`

Overwrite with (exactly):
```typescript
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { UserResponse } from "@grade-sight/shared";

export interface EntitlementResponse {
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: "parent_monthly" | "teacher_monthly" | null;
  is_entitled: boolean;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    throw new Error("No session token");
  }
  return fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
}

export async function fetchMe(): Promise<UserResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/me failed: ${response.status}`);
  return (await response.json()) as UserResponse;
}

export async function fetchEntitlement(): Promise<EntitlementResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/me/entitlement`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/me/entitlement failed: ${response.status}`);
  return (await response.json()) as EntitlementResponse;
}

export async function createCheckoutSession(): Promise<string> {
  const response = await authedFetch(`/api/billing/checkout`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/billing/checkout failed: ${response.status}`);
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}

export async function createPortalSession(): Promise<string> {
  const response = await authedFetch(`/api/billing/portal`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/billing/portal failed: ${response.status}`);
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}
```

- [ ] **Step 2: Verify typecheck + build**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web typecheck && pnpm --filter web build
```
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/web/lib/api.ts
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add entitlement + checkout + portal helpers to lib/api.ts

fetchEntitlement returns the current user's subscription state; null
on 401. createCheckoutSession and createPortalSession are server-side
Clerk-authenticated POSTs that return Stripe-hosted URLs for the
frontend to redirect to. Retains existing fetchMe; factors shared
auth into authedFetch helper.

EntitlementResponse interface is defined inline rather than exported
from @grade-sight/shared — web-only for now; promote to shared later
if needed on other clients.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: TrialBanner + dashboard update

**Files:**
- Create: `apps/web/components/TrialBanner.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`

- [ ] **Step 1: Create `TrialBanner.tsx`**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/web/components
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/components/TrialBanner.tsx`

Content (exactly):
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface TrialBannerProps {
  trialEndsAt: string; // ISO 8601
  onCheckout: () => Promise<string>;
}

export function TrialBanner({ trialEndsAt, onCheckout }: TrialBannerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const url = await onCheckout();
        window.location.assign(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start checkout");
      }
    });
  };

  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="text-sm text-amber-900">
        Trial ends in <strong>{daysRemaining}</strong>{" "}
        {daysRemaining === 1 ? "day" : "days"}. Add a card to keep your access.
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-700">{error}</span>}
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isPending ? "Redirecting…" : "Add card"}
        </button>
      </div>
    </div>
  );
}
```

**Note:** `onCheckout` is a prop (passed in by the server-component dashboard page via a server action or client-callable wrapper). This keeps TrialBanner a pure client component.

- [ ] **Step 2: Update `dashboard/page.tsx`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/dashboard/page.tsx`

Overwrite with (exactly):
```tsx
import { SignOutButton } from "@clerk/nextjs";
import { createCheckoutSession, fetchEntitlement, fetchMe } from "@/lib/api";
import { TrialBanner } from "@/components/TrialBanner";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

export default async function DashboardPage() {
  const [user, entitlement] = await Promise.all([fetchMe(), fetchEntitlement()]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>Loading…</p>
      </main>
    );
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  const showBanner =
    entitlement?.status === "trialing" &&
    entitlement.trial_ends_at !== null &&
    (new Date(entitlement.trial_ends_at).getTime() - Date.now()) /
      (1000 * 60 * 60 * 24) <=
      7;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      {showBanner && entitlement?.trial_ends_at && (
        <div className="w-full max-w-xl">
          <TrialBanner
            trialEndsAt={entitlement.trial_ends_at}
            onCheckout={handleCheckout}
          />
        </div>
      )}
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
      <SignOutButton />
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web build
```
Expected: build succeeds. `/dashboard` listed as dynamic.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/web/components \
  apps/web/app/dashboard/page.tsx
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add TrialBanner component + wire into dashboard

TrialBanner shows remaining trial days and an Add-card button that
calls a server action returning a Stripe Checkout URL, then redirects
via window.location.assign. Rendered on /dashboard only when entitlement
is trialing AND trial_ends_at is within 7 days.

Dashboard now parallel-fetches user + entitlement; banner slots above
existing 'Logged in as' block when applicable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: /settings/billing page

**Files:**
- Create: `apps/web/app/settings/billing/page.tsx`

- [ ] **Step 1: Create directory + page**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/web/app/settings/billing
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/settings/billing/page.tsx`

Content (exactly):
```tsx
import Link from "next/link";
import { createPortalSession, fetchEntitlement } from "@/lib/api";

async function handlePortal() {
  "use server";
  return await createPortalSession();
}

const PLAN_LABELS: Record<string, string> = {
  parent_monthly: "Parent Monthly — $15/month",
  teacher_monthly: "Teacher Monthly — $25/month",
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Canceled",
  incomplete: "Incomplete setup",
};

export default async function BillingSettingsPage() {
  const entitlement = await fetchEntitlement();

  if (!entitlement || entitlement.status === null) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-4 text-gray-600">No subscription found.</p>
      </main>
    );
  }

  const planLabel = entitlement.plan ? PLAN_LABELS[entitlement.plan] ?? entitlement.plan : "—";
  const statusLabel = STATUS_LABELS[entitlement.status] ?? entitlement.status;
  const nextBilling =
    entitlement.current_period_end !== null
      ? new Date(entitlement.current_period_end).toLocaleDateString()
      : entitlement.trial_ends_at !== null
        ? `${new Date(entitlement.trial_ends_at).toLocaleDateString()} (trial end)`
        : "—";

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Billing</h1>
      <dl className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
        <div className="flex justify-between py-3">
          <dt className="text-sm text-gray-600">Plan</dt>
          <dd className="text-sm font-medium">{planLabel}</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-sm text-gray-600">Status</dt>
          <dd className="text-sm font-medium">{statusLabel}</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-sm text-gray-600">Next billing date</dt>
          <dd className="text-sm font-medium">{nextBilling}</dd>
        </div>
      </dl>
      <form action={async () => {
        "use server";
        const url = await handlePortal();
        const { redirect } = await import("next/navigation");
        redirect(url);
      }}>
        <button
          type="submit"
          className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Manage billing (Stripe Customer Portal)
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web build
```
Expected: build succeeds. `/settings/billing` listed in routes.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/web/app/settings
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add /settings/billing page

Protected by Clerk middleware (covers /dashboard(.*) — extend if needed).
Renders current plan, status, and next billing date from /api/me/entitlement.
Manage-billing button invokes a server action that hits /api/billing/portal
and redirects to Stripe's Customer Portal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Post-commit note:** `/settings/billing` is NOT currently matched by our middleware's `/dashboard(.*)` protection pattern — which means unauthenticated users could reach it. The page will throw on `fetchEntitlement()` returning null, but that's not ideal UX. Fix in Task 12 below (update middleware matcher).

---

## Task 12: /paywall page + middleware update

**Files:**
- Create: `apps/web/app/paywall/page.tsx`
- Modify: `apps/web/middleware.ts`

- [ ] **Step 1: Create /paywall page**

```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/web/app/paywall
```

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/paywall/page.tsx`

Content (exactly):
```tsx
import { createCheckoutSession, createPortalSession, fetchEntitlement } from "@/lib/api";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

async function handlePortal() {
  "use server";
  return await createPortalSession();
}

export default async function PaywallPage() {
  const entitlement = await fetchEntitlement();

  let title = "Subscription required";
  let body = "Your access has ended.";
  let action: "checkout" | "portal" = "checkout";

  if (entitlement) {
    if (entitlement.status === "canceled") {
      if (entitlement.current_period_end === null && entitlement.trial_ends_at !== null) {
        title = "Your trial has ended";
        body = "Add a card to reactivate your subscription.";
        action = "checkout";
      } else {
        title = "Your subscription was canceled";
        body = "Reactivate through the Customer Portal.";
        action = "portal";
      }
    } else if (entitlement.status === "past_due") {
      title = "Payment issue detected";
      body = "Please update your payment method.";
      action = "portal";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-lg text-gray-600">{body}</p>
      <form
        action={async () => {
          "use server";
          const url = action === "checkout" ? await handleCheckout() : await handlePortal();
          const { redirect } = await import("next/navigation");
          redirect(url);
        }}
      >
        <button
          type="submit"
          className="mt-8 rounded-lg bg-black px-6 py-3 text-base font-medium text-white hover:bg-gray-800"
        >
          {action === "checkout" ? "Add card" : "Manage billing"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Update middleware to protect /settings and /paywall**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/middleware.ts`

Overwrite with:
```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/settings(.*)",
  "/paywall(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 3: Verify build**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web build
```
Expected: build succeeds. Route list includes `/paywall`, `/settings/billing`.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add \
  apps/web/app/paywall \
  apps/web/middleware.ts
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add /paywall page + expand middleware protection

/paywall branches on entitlement state: canceled+no-card → Checkout CTA,
canceled+post-card → Portal CTA, past_due → Portal CTA.

Middleware matcher extended to protect /settings(.*) and /paywall(.*)
in addition to /dashboard(.*). Unauthenticated users hitting either
get redirected to /sign-in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Stripe setup section**

Read `/Users/exexporerporer/Projects/Grade-Sight/README.md`. Find the `## Clerk authentication (local dev)` section. Insert a new `## Stripe billing (local dev)` section immediately AFTER it (before `## Deployment` if that's next; otherwise before whatever follows Clerk).

New section content (replace `[FENCE]` with three literal backticks in the final file):

```
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

[FENCE]bash
stripe listen --forward-to localhost:8000/api/webhooks/stripe
[FENCE]

   Stripe CLI prints a webhook signing secret (`whsec_...`); use it as
   `STRIPE_WEBHOOK_SECRET` locally.

7. Fill in `apps/api/.env`:

[FENCE]bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PARENT_MONTHLY=price_...
STRIPE_PRICE_TEACHER_MONTHLY=price_...
[FENCE]

8. Fill in `apps/web/.env.local`:

[FENCE]bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
[FENCE]

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

```

**CRITICAL:** replace all `[FENCE]` placeholders with triple backticks (```) in the final file. Verify with:
```bash
grep -c FENCE /Users/exexporerporer/Projects/Grade-Sight/README.md
```
Expected: `0`.

- [ ] **Step 2: Verify all checks pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm typecheck && pnpm lint && pnpm build
```
Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add README.md
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Document Stripe local-dev setup in README

Walks through Stripe dashboard product/price creation, Stripe CLI
webhook forwarding (stripe listen), and filling the STRIPE_* env vars
in both .env files. Includes test card numbers for common scenarios.

Notes production deploy requires Live-mode keys + webhook endpoint
registration in the production Stripe dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Acceptance run (automated + manual-test checklist)

**Files:** none — verification only, no commits.

Automated portion runs entirely without Stripe keys being real (endpoints 401/400 correctly; we don't exercise Stripe). Manual portion requires the user's Stripe test keys + Stripe CLI.

- [ ] **Step 1: Clean-slate install + migrate**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
docker compose down -v
docker compose up -d db
sleep 12
pnpm install
pnpm db:migrate
```

Expected: all three migrations applied in order (`b9189088c385`, `f7ad39986104`, new Spec 4 revision).

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
pnpm dev > /tmp/gs-task14-dev.log 2>&1 &
DEV_PID=$!
sleep 18

echo "--- /api/health ---"
curl -s http://localhost:8000/api/health
echo ""
echo "--- /api/db-health ---"
curl -s http://localhost:8000/api/db-health
echo ""
echo "--- /api/me/entitlement (no auth → 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8000/api/me/entitlement
echo "--- /api/billing/checkout (no auth → 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:8000/api/billing/checkout
echo "--- /api/billing/portal (no auth → 401) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:8000/api/billing/portal
echo "--- /api/webhooks/stripe (no signature → 400) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:8000/api/webhooks/stripe -d "{}"
echo "--- web / ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000 || echo "web failed"
echo "--- web /paywall (no auth → redirect) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/paywall || echo "paywall failed"
echo "--- web /settings/billing (no auth → redirect) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/settings/billing || echo "settings/billing failed"

kill -TERM $DEV_PID 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
sleep 2
```

Expected:
- `/api/health` → `{"status":"ok","environment":"development"}`
- `/api/db-health` → `{"status":"ok","latency_ms":<N>}`
- `/api/me/entitlement` → HTTP 401
- `/api/billing/checkout` → HTTP 401
- `/api/billing/portal` → HTTP 401
- `/api/webhooks/stripe` → HTTP 400
- web `/` → HTTP 200 (only if Clerk keys are populated — otherwise 500 is acceptable and noted for the user)
- `/paywall`, `/settings/billing` → HTTP 307/308 (redirect to sign-in when unauthenticated)

If web returns 500, confirm it's because `apps/web/.env.local` still has `REPLACE_ME` placeholders (Clerk validation failing on ClerkProvider). That's fine until the user sets real keys — not a Spec 4 regression.

- [ ] **Step 4: Walk the 18 acceptance criteria**

Report **PASS** / **PARTIAL** / **MANUAL** for each:

| # | Criterion | How to check |
|---|---|---|
| 1 | Clean install + migrate produces full schema | Step 1 + `\dt` check |
| 2 | Migration reversible | `pnpm db:rollback; pnpm db:migrate` cycle |
| 3 | Parent sign-up end-to-end (local) | MANUAL — needs real Clerk + Stripe keys + browser |
| 4 | Teacher sign-up end-to-end | MANUAL |
| 5 | `/api/me` returns user | Step 3 (indirectly — returns 401 without auth, works with a real JWT) |
| 6 | `/api/me/entitlement` returns trial state | MANUAL (needs auth) |
| 7 | `/api/billing/checkout` returns Stripe URL | MANUAL (needs real Stripe keys) |
| 8 | Adding card via Checkout → webhook links | MANUAL |
| 9 | Trial end → active via Stripe webhook simulation | MANUAL |
| 10 | `/api/billing/portal` returns Portal URL | MANUAL |
| 11 | Webhook signature verification rejects forged | Step 3 (HTTP 400 confirmed without signature) |
| 12 | Duplicate webhook returns 200 without reprocessing | MANUAL (requires `stripe trigger` replays) |
| 13 | typecheck / lint / build / test pass | Step 2 |
| 14 | TrialBanner renders on dashboard | MANUAL |
| 15 | `/paywall` loads | Step 3 (307 redirect when unauthenticated — confirms route exists) |
| 16 | `/settings/billing` loads | Step 3 (same) |
| 17 | README has Stripe setup section | `grep "## Stripe billing" README.md` |
| 18 | Deployed to Railway | DEFERRED — separate post-implementation step |

- [ ] **Step 5: Final report**

Report:
- Total commits since Spec 4 started (~13 code commits + plan + spec ≈ 15)
- `git log --oneline | head -20` since Spec 3 completion
- Working tree status

Then include this **manual acceptance checklist** verbatim:

> **To fully accept Spec 4, the user must:**
>
> 1. Create a Stripe dev instance (sign up at stripe.com, stay in Test mode).
> 2. Create two Products (Parent Plan at $15/month, Teacher Plan at $25/month). Record the price IDs.
> 3. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` then `stripe login`.
> 4. Start `stripe listen --forward-to localhost:8000/api/webhooks/stripe` in a separate terminal. Copy the `whsec_...` signing secret.
> 5. Update `apps/api/.env` — replace the `REPLACE_ME` values for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PARENT_MONTHLY`, `STRIPE_PRICE_TEACHER_MONTHLY`.
> 6. Update `apps/web/.env.local` — replace `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with your real `pk_test_...`.
> 7. Restart `pnpm dev`.
> 8. Delete any existing Clerk test users (so sign-up can reuse the emails).
> 9. **Parent flow:** Sign up as parent → confirm dashboard shows parent role + "Organization: ...'s Family". Check Stripe Dashboard → Customers: a new customer exists. Check local DB: `docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "SELECT plan, status, trial_ends_at FROM subscriptions"` — one row with status=trialing, 30 days out.
> 10. **Teacher flow:** Sign up as teacher with a different email → confirm dashboard shows teacher role + "Organization: ...'s Classroom". DB now has two subscription rows.
> 11. **Trial banner:** Manually set `trial_ends_at` to 5 days from now in the DB (`UPDATE subscriptions SET trial_ends_at = now() + interval '5 days'`). Reload dashboard → banner appears.
> 12. **Add card flow:** Click "Add card" → redirected to Stripe Checkout hosted page → use test card `4242 4242 4242 4242` → complete → redirected back. Verify webhook arrived in `stripe listen` output. Verify DB: `SELECT stripe_subscription_id FROM subscriptions` is now populated.
> 13. **Portal flow:** Visit `/settings/billing` → click "Manage billing" → redirected to Stripe Customer Portal. Cancel the subscription → verify webhook arrived → `SELECT cancel_at_period_end FROM subscriptions` is `true`.
> 14. **Idempotency:** From Stripe CLI, run `stripe trigger customer.subscription.updated` twice. Verify `subscription_events` has one row for each unique `stripe_event_id` (duplicate detections).
>
> If all steps pass, Spec 4 is functionally accepted. Push commits to origin/main and consider production Stripe setup as a separate follow-up.

**No commit in Task 14.**

---

## Completion criteria (plan-level)

- Tasks 1–13 committed individually to `main` (~13 commits).
- Step 3 of Task 14 shows all expected HTTP status codes.
- Manual-acceptance checklist delivered to the user.
- Manual acceptance pass (user's Stripe dev keys + browser) confirms both sign-up paths + add-card flow + portal flow + webhook idempotency.
- Deploy-to-Railway acceptance is deferred to a separate post-implementation step.
