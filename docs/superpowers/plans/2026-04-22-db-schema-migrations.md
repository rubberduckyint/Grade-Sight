# DB Schema & Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the async SQLAlchemy 2.x + Alembic + Postgres infrastructure defined in `docs/superpowers/specs/2026-04-22-db-schema-migrations-design.md` — the 10 day-one tables, a session-per-request dependency, reversible initial migration, local Postgres via Docker Compose, and a `/api/db-health` endpoint.

**Architecture:** SQLAlchemy 2.x declarative models with composable mixins (TimestampMixin, SoftDeleteMixin, TenantMixin) live under `apps/api/src/grade_sight_api/models/`. A thin `db/` module owns the AsyncEngine, session factory, and FastAPI dependency. Alembic at `apps/api/alembic/` manages migrations using an async-aware `env.py`. Local dev uses `compose.yaml` Postgres 16; production is the Railway Postgres we provisioned earlier.

**Tech Stack:** SQLAlchemy 2.x + `sqlalchemy[asyncio]`, Alembic, asyncpg, Pydantic v2 (already present), Postgres 16, Docker Compose.

**No tests authored.** Per the spec and kickoff, this plan sets up test scaffolding but writes zero assertions. Verification at each task boundary is "run the command, confirm the expected output."

**Prerequisites before starting:**
- Spec 1 scaffolding complete; repo on branch `main`, clean working tree.
- Docker Desktop (or Docker Engine + Compose) installed and running.
- Railway Postgres provisioned, `DATABASE_URL = ${{Postgres.DATABASE_URL}}` linked to api service. (User confirmed.)
- uv on PATH (via `~/.zshenv` sourcing `~/.local/bin/env`).

---

## Task 1: Add Python dependencies and local Postgres

**Files:**
- Modify: `apps/api/pyproject.toml`
- Create: `compose.yaml` (repo root)

- [ ] **Step 1: Add SQLAlchemy, Alembic, asyncpg to `pyproject.toml`**

Using the Edit tool, modify the `dependencies` list in `/Users/exexporerporer/Projects/Grade-Sight/apps/api/pyproject.toml` to include:

```
"sqlalchemy[asyncio]>=2.0.36",
"alembic>=1.14.0",
"asyncpg>=0.30.0",
```

After editing, the `dependencies` block should look like:
```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.5.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "alembic>=1.14.0",
    "asyncpg>=0.30.0",
]
```

- [ ] **Step 2: Write `compose.yaml` at repo root**

Path: `/Users/exexporerporer/Projects/Grade-Sight/compose.yaml`

Content (exactly):
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: grade_sight
      POSTGRES_USER: grade_sight
      POSTGRES_PASSWORD: grade_sight
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U grade_sight -d grade_sight"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  db-data:
```

- [ ] **Step 3: Start local Postgres and verify**

Run:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && docker compose up -d db
```
Wait ~10 seconds, then:
```bash
docker compose ps
```
Expected: the `db` service shows state `running` and health `healthy`.

If Docker isn't running, start Docker Desktop and retry.

- [ ] **Step 4: Sync Python deps via uv**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv sync
```
Expected: uv resolves and installs sqlalchemy, alembic, asyncpg along with existing deps. `uv.lock` is updated.

- [ ] **Step 5: Verify imports**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "import sqlalchemy, alembic, asyncpg; print(sqlalchemy.__version__, alembic.__version__, asyncpg.__version__)"
```
Expected: three version strings printed, no errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/pyproject.toml apps/api/uv.lock compose.yaml
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add DB deps (SQLAlchemy 2, Alembic, asyncpg) and local Postgres

SQLAlchemy async stack and Alembic pinned in apps/api/pyproject.toml.
compose.yaml at repo root brings up postgres:16-alpine for local dev,
mirroring the Postgres major version running on Railway. Healthcheck
defined so pg_isready gating works from scripts.

Per docs/superpowers/specs/2026-04-22-db-schema-migrations-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB module and config extension

**Files:**
- Create: `apps/api/src/grade_sight_api/db/__init__.py`, `db/base.py`, `db/mixins.py`, `db/session.py`
- Modify: `apps/api/src/grade_sight_api/config.py`

- [ ] **Step 1: Create the `db/` directory**

Run:
```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/db
```

- [ ] **Step 2: Write `db/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/db/__init__.py`

Content:
```python
"""Database infrastructure: engine, session factory, declarative base, mixins."""

from .base import Base
from .session import engine, async_session_factory, get_session

__all__ = ["Base", "engine", "async_session_factory", "get_session"]
```

- [ ] **Step 3: Write `db/base.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/db/base.py`

Content (exactly):
```python
"""SQLAlchemy declarative base with a stable naming convention.

The naming convention ensures Alembic autogenerate produces deterministic
index, unique-constraint, check, foreign-key, and primary-key names.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Shared declarative base for all Grade-Sight ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
```

- [ ] **Step 4: Write `db/mixins.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/db/mixins.py`

Content (exactly):
```python
"""Reusable column mixins for Grade-Sight ORM models.

- TimestampMixin: created_at, updated_at with server-side defaults.
- SoftDeleteMixin: deleted_at column (nullable). No auto-filtering — queries
  include .where(Model.deleted_at.is_(None)) explicitly.
- TenantMixin: organization_id column (nullable for parent-mode rows).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """Adds created_at and updated_at columns with server defaults."""

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Adds a nullable deleted_at column for soft-delete semantics."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
    )


class TenantMixin:
    """Adds a nullable organization_id column (FK to organizations.id).

    Nullable so parent-mode rows (no org) can use the same schema.
    """

    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=True,
    )
```

- [ ] **Step 5: Extend `config.py` with DB settings**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/config.py`

Read the current file first. Replace its content with (exactly):
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


settings = Settings()
```

- [ ] **Step 6: Write `db/session.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/db/session.py`

Content (exactly):
```python
"""AsyncEngine, async session factory, and FastAPI dependency.

One process-wide engine, bound sessionmaker. get_session() yields an
AsyncSession that commits on success, rolls back on exception, and closes
on exit — the canonical FastAPI DB dep pattern.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import settings

engine: AsyncEngine = create_async_engine(
    str(settings.database_url),
    pool_pre_ping=True,
    future=True,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession for a FastAPI request.

    Commits on successful exit; rolls back on exception; always closes.
    """
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
```

- [ ] **Step 7: Update `apps/api/.env` with DATABASE_URL**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/.env`

Read the current file and append (or add if not present):
```
DATABASE_URL=postgresql+asyncpg://grade_sight:grade_sight@localhost:5432/grade_sight
```

This file is gitignored. Local-only.

- [ ] **Step 8: Verify imports and settings load**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.db import Base, engine, get_session; from grade_sight_api.config import settings; print('OK', settings.database_url)"
```
Expected: prints `OK` and a redacted-looking PostgresDsn like `postgresql+asyncpg://grade_sight:********@localhost:5432/grade_sight`.

If it errors on `database_url` missing, check that `apps/api/.env` has the line from Step 7.

- [ ] **Step 9: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/db apps/api/src/grade_sight_api/config.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add DB module: Base, mixins, async session, config

db/base.py defines DeclarativeBase with a stable Alembic naming
convention. db/mixins.py provides TimestampMixin, SoftDeleteMixin,
TenantMixin. db/session.py owns the AsyncEngine, async_sessionmaker,
and the FastAPI get_session() dependency with commit/rollback/close
semantics. config.py extended with database_url (required) and
test_database_url (optional) as PostgresDsn-validated fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Model classes

**Files:**
- Create: `apps/api/src/grade_sight_api/models/{__init__.py, organization.py, user.py, student.py, student_profile.py, klass.py, class_member.py, assessment.py, answer_key.py, audit_log.py, llm_call_log.py}`

- [ ] **Step 1: Create models directory**

Run:
```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models
```

- [ ] **Step 2: Write `organization.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/organization.py`

Content (exactly):
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
```

- [ ] **Step 3: Write `user.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/user.py`

Content (exactly):
```python
"""User model — mirrors Clerk-authenticated users.

Role enum: parent, teacher, admin. clerk_id is the canonical external
identifier; email is stored for convenience but Clerk is authoritative.
"""

from __future__ import annotations

import enum
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class UserRole(str, enum.Enum):
    parent = "parent"
    teacher = "teacher"
    admin = "admin"


class User(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    clerk_id: Mapped[str] = mapped_column(unique=True, nullable=False)
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"),
        nullable=False,
    )
    first_name: Mapped[str | None] = mapped_column(nullable=True)
    last_name: Mapped[str | None] = mapped_column(nullable=True)
```

- [ ] **Step 4: Write `student.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/student.py`

Content (exactly):
```python
"""Student model (PII).

Holds identifiable data: names, DOB, consent flags. Learning data lives in
student_profiles (linked 1:1). Never put learning fields on this table.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class Student(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "students"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(nullable=True)
    consent_flags: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default="{}",
    )
```

- [ ] **Step 5: Write `student_profile.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/student_profile.py`

Content (exactly):
```python
"""StudentProfile model (non-PII).

1:1 with Student. Thin by design — rich learning columns arrive with the
diagnostic engine spec. organization_id denormalized from students for
tenant-scoped queries.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class StudentProfile(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "student_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    grade_level: Mapped[str | None] = mapped_column(nullable=True)
    profile_metadata: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default="{}",
    )
```

Note: the JSONB column is named `profile_metadata` (not `metadata`) because SQLAlchemy's `Base` already has a `.metadata` attribute pointing at the `MetaData` object. Python attribute `profile_metadata` maps to the DB column name we want — we'll also give it an explicit `name=` to keep the SQL column name as `metadata`:

Actually, to keep both the Python attribute and SQL column named `metadata`, use `name="metadata"` in `mapped_column`. Replace the `profile_metadata` block with:

```python
    profile_metadata: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
    )
```

This keeps the Python attribute as `profile_metadata` (avoiding the SQLAlchemy reserved-name collision) while the SQL column is `metadata`.

- [ ] **Step 6: Write `klass.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/klass.py`

Content (exactly):
```python
"""Class model (table: classes). Module renamed to klass to avoid Python keyword.

Always organization-scoped (organization_id is non-null).
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin


class Klass(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "classes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    # classes are always org-scoped — NOT NULL organization_id
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    teacher_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    subject: Mapped[str | None] = mapped_column(nullable=True)
    grade_level: Mapped[str | None] = mapped_column(nullable=True)
```

- [ ] **Step 7: Write `class_member.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/class_member.py`

Content (exactly):
```python
"""ClassMember model — M2M between students and classes.

Partial unique on (class_id, student_id) WHERE left_at IS NULL prevents
duplicate active memberships while allowing historical re-enrollment.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class ClassMember(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "class_members"
    __table_args__ = (
        Index(
            "uq_class_members_active",
            "class_id",
            "student_id",
            unique=True,
            postgresql_where=text("left_at IS NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    class_id: Mapped[UUID] = mapped_column(
        ForeignKey("classes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("students.id", ondelete="RESTRICT"),
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("now()"),
    )
    left_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

- [ ] **Step 8: Write `assessment.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/assessment.py`

Content (exactly):
```python
"""Assessment model — uploaded graded work.

Status enum drives the async diagnostic pipeline. s3_url + original_filename
locate the uploaded image. answer_key_id optional (can be uploaded later).
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class AssessmentStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Assessment(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "assessments"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("students.id", ondelete="RESTRICT"),
        nullable=False,
    )
    class_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("classes.id", ondelete="RESTRICT"),
        nullable=True,
    )
    answer_key_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("answer_keys.id", ondelete="RESTRICT"),
        nullable=True,
    )
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    s3_url: Mapped[str] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus, name="assessment_status"),
        nullable=False,
        server_default=AssessmentStatus.pending.value,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("now()"),
    )
```

- [ ] **Step 9: Write `answer_key.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/answer_key.py`

Content (exactly):
```python
"""AnswerKey model — per-assignment reference data.

May be image-based (s3_url) or structured (content JSONB) or both.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class AnswerKey(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "answer_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    s3_url: Mapped[str | None] = mapped_column(nullable=True)
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

- [ ] **Step 10: Write `audit_log.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/audit_log.py`

Content (exactly):
```python
"""AuditLog — append-only record of data-access events.

No updated_at, no deleted_at. Written by the service layer (Spec 4).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import TenantMixin


class AuditLog(Base, TenantMixin):
    __tablename__ = "audit_log"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    resource_type: Mapped[str] = mapped_column(nullable=False)
    resource_id: Mapped[UUID | None] = mapped_column(nullable=True)
    action: Mapped[str] = mapped_column(nullable=False)
    event_metadata: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
```

Note: Python attribute is `event_metadata`, SQL column is `metadata` (via the `"metadata"` first positional arg), dodging SQLAlchemy's `.metadata` collision. Same pattern used in `student_profile.py`.

- [ ] **Step 11: Write `llm_call_log.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/llm_call_log.py`

Content (exactly):
```python
"""LLMCallLog — append-only record of every Claude (or other LLM) call.

Written by the service layer (Spec 4). Powers cost dashboards and the
observability story around model usage.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import TenantMixin


class LLMCallLog(Base, TenantMixin):
    __tablename__ = "llm_call_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    model: Mapped[str] = mapped_column(nullable=False)
    tokens_input: Mapped[int] = mapped_column(nullable=False)
    tokens_output: Mapped[int] = mapped_column(nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    latency_ms: Mapped[int] = mapped_column(nullable=False)
    request_type: Mapped[str] = mapped_column(nullable=False)
    success: Mapped[bool] = mapped_column(nullable=False)
    error_message: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
```

- [ ] **Step 12: Write `models/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/models/__init__.py`

Content (exactly):
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
    "Student",
    "StudentProfile",
    "User",
    "UserRole",
]
```

- [ ] **Step 13: Verify all models import cleanly**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api import models; print([m for m in models.__all__])"
```
Expected: prints the full list of 12 exported names, no errors.

- [ ] **Step 14: Verify mypy passes on the new code**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src
```
Expected: `Success: no issues found in N source files`.

- [ ] **Step 15: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/models
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add SQLAlchemy models for the 10 day-one tables

One model per file, composing TimestampMixin, SoftDeleteMixin,
TenantMixin. UserRole and AssessmentStatus as Postgres enums.
Students hold PII (name, DOB, consent_flags JSONB); student_profiles
hold non-PII, intentionally thin until the diagnostic engine work
begins. class_members has a partial unique index for active memberships.
audit_log and llm_call_logs are append-only (no updated_at/deleted_at).

The 'metadata' JSONB column name collides with SQLAlchemy's
Base.metadata attribute; Python-side attributes are profile_metadata
and event_metadata, SQL column name stays 'metadata'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Alembic initialization

**Files:**
- Create: `apps/api/alembic.ini`, `apps/api/alembic/env.py`, `apps/api/alembic/script.py.mako`, `apps/api/alembic/versions/.gitkeep`

- [ ] **Step 1: Initialize Alembic with async template**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic init -t async alembic
```
Expected: creates `alembic/` directory with `env.py`, `script.py.mako`, `README`, and an empty `versions/` directory. Also creates `alembic.ini` at `apps/api/`.

- [ ] **Step 2: Edit `alembic.ini`**

Read `/Users/exexporerporer/Projects/Grade-Sight/apps/api/alembic.ini`. Find the line starting with `sqlalchemy.url = ` and change its value to an empty string (we'll read the URL from settings in env.py):

```ini
sqlalchemy.url =
```

Leave everything else alone.

- [ ] **Step 3: Replace `alembic/env.py` with our async-aware version**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/alembic/env.py`

Overwrite with (exactly):
```python
"""Alembic async env for Grade-Sight.

Reads DATABASE_URL from application settings (not from alembic.ini).
Imports all ORM models so autogenerate sees the full metadata.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from grade_sight_api.config import settings
from grade_sight_api.db.base import Base
from grade_sight_api import models  # noqa: F401 — side effect: registers all models

config = context.config

# Inject DATABASE_URL from settings into Alembic config.
config.set_main_option("sqlalchemy.url", str(settings.database_url))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection — generates SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Ensure `versions/` directory is committed**

The `alembic init` step created `versions/` empty. Git won't track empty directories. Add a `.gitkeep`:

```bash
touch /Users/exexporerporer/Projects/Grade-Sight/apps/api/alembic/versions/.gitkeep
```

- [ ] **Step 5: Verify Alembic can reach the models**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic check
```
Expected: Alembic prints something like `No new upgrade operations detected` only if the DB is already in sync (it isn't — DB is empty). More likely output: a message about pending upgrades or a note that there's nothing to check yet. Exit 0 is the pass bar.

If Alembic fails with an import error, check that `env.py` can resolve `grade_sight_api.config` — the package must be installed in the current uv env (it is, via `uv sync` + our hatchling config).

- [ ] **Step 6: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/alembic.ini apps/api/alembic
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Initialize Alembic with async env.py for Grade-Sight models

alembic init -t async alembic, then env.py replaced with a Grade-Sight
-specific version that reads DATABASE_URL from application settings
rather than alembic.ini, and imports all ORM models so autogenerate
sees the full metadata. compare_type and compare_server_default both
enabled for accurate diffs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Generate and commit the initial migration

**Files:**
- Create: `apps/api/alembic/versions/<timestamp>_initial_schema.py` (filename auto-generated; content hand-reviewed)

- [ ] **Step 1: Confirm DB is up and empty**

Run:
```bash
docker compose -f /Users/exexporerporer/Projects/Grade-Sight/compose.yaml ps
```
Expected: `db` service is running and healthy.

Run:
```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\dt"
```
Expected: `Did not find any relations.`

- [ ] **Step 2: Autogenerate the initial migration**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic revision --autogenerate -m "initial schema"
```
Expected: Alembic creates a file at `alembic/versions/<timestamp>_initial_schema.py`. The console output lists the detected operations (CREATE TABLE for each of the 10 tables, CREATE TYPE for user_role and assessment_status enums, CREATE INDEX for all indexes).

- [ ] **Step 3: Review the generated migration carefully**

Open the new file at `apps/api/alembic/versions/<timestamp>_initial_schema.py` and verify:

- Exactly **10 CREATE TABLE** calls — one for each of: organizations, users, students, student_profiles, classes, class_members, assessments, answer_keys, audit_log, llm_call_logs.
- **Two CREATE TYPE** calls for `user_role` (values: parent, teacher, admin) and `assessment_status` (values: pending, processing, completed, failed).
- All FK constraints use `ondelete="RESTRICT"` **except** student_profiles → students which is `ondelete="CASCADE"`.
- Partial unique index on `class_members(class_id, student_id) WHERE left_at IS NULL` is present (look for `postgresql_where`).
- The `downgrade()` function drops tables in reverse FK order and drops the enum types at the end.
- No extraneous operations (no `ALTER` or `DROP` — this is an initial schema).

If the generated migration looks wrong in any respect, stop and report rather than editing. It's easier to fix the model then re-autogenerate than to patch a bad migration.

- [ ] **Step 4: Apply the migration**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic upgrade head
```
Expected: Alembic prints `Running upgrade -> <rev>, initial schema`. Exit 0.

- [ ] **Step 5: Verify tables exist**

Run:
```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\dt"
```
Expected: lists 11 tables: `alembic_version` plus the 10 domain tables.

Run:
```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\dT"
```
Expected: lists the two custom enum types (`user_role`, `assessment_status`).

- [ ] **Step 6: Verify re-running autogenerate produces an empty migration**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run alembic revision --autogenerate -m "check no drift"
```
Open the newly created file. Its `upgrade()` function body should be just `pass` (or have only a comment). Its `downgrade()` should also be empty.

This proves the models exactly match the applied schema.

**If the generated `upgrade()` has any operations**, there's drift between the models and the schema — fix the model, re-autogenerate the initial migration (delete the old one first, along with any extras), and retry.

- [ ] **Step 7: Delete the empty drift-check migration**

Assuming Step 6 confirmed no drift:
```bash
# Find and remove the no-op migration file (the one you just generated):
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api/alembic/versions
ls -t | head -n 1 | xargs rm
```
(Or manually identify the latest file and delete it.)

- [ ] **Step 8: Verify downgrade works**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic downgrade base
```
Expected: Alembic drops all tables and enums. Then:
```bash
docker exec $(docker ps -qf "name=db") psql -U grade_sight -d grade_sight -c "\dt"
```
Expected: `Did not find any relations.` (or just the `alembic_version` table; check Alembic's exact behavior — it typically empties alembic_version on full downgrade).

Re-apply for subsequent tasks:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run alembic upgrade head
```

- [ ] **Step 9: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/alembic/versions
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add initial Alembic migration for all 10 day-one tables

Single autogenerated migration, hand-reviewed, verified reversible
against local Postgres. Covers organizations, users, students,
student_profiles, classes, class_members, assessments, answer_keys,
audit_log, llm_call_logs, plus user_role and assessment_status enum
types and all indexes. Re-running autogenerate against the applied
schema produces an empty diff.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: /api/db-health endpoint + engine lifespan

**Files:**
- Modify: `apps/api/src/grade_sight_api/main.py`

- [ ] **Step 1: Replace `main.py` with the extended version**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/main.py`

Content (exactly):
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


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Dispose of the async engine cleanly on shutdown."""
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="Grade-Sight API", version="0.0.0", lifespan=lifespan)


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

- [ ] **Step 2: Verify import**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run python -c "from grade_sight_api.main import app; print([r.path for r in app.routes])"
```
Expected: list includes `/api/health` and `/api/db-health`.

- [ ] **Step 3: Start uvicorn and probe both endpoints**

In one terminal:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && \
  uv run uvicorn grade_sight_api.main:app --port 8001 &
API_PID=$!
sleep 3
echo "--- /api/health ---"
curl -s http://localhost:8001/api/health
echo ""
echo "--- /api/db-health ---"
curl -s http://localhost:8001/api/db-health
echo ""
kill $API_PID 2>/dev/null || true
```

Expected output:
```
--- /api/health ---
{"status":"ok","environment":"development"}
--- /api/db-health ---
{"status":"ok","latency_ms":<small integer>}
```

If `/api/db-health` returns 503, Postgres isn't running or DATABASE_URL is wrong. `docker compose ps` to check.

- [ ] **Step 4: Verify typecheck**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src
```
Expected: `Success: no issues found in N source files`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/src/grade_sight_api/main.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add /api/db-health endpoint and engine lifespan

/api/db-health performs SELECT 1 against the DB and reports latency.
Returns 503 with a useful error class name if the DB is unreachable.
FastAPI lifespan context disposes the async engine cleanly on shutdown
so connections are returned to the pool and the process exits clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Test fixtures (no tests authored)

**Files:**
- Modify: `apps/api/tests/conftest.py`

- [ ] **Step 1: Replace `conftest.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/tests/conftest.py`

Content (exactly):
```python
"""Pytest fixtures for Grade-Sight API tests.

No tests are defined yet; this file exists so DB-backed tests can be
added later without another scaffolding pass.

Fixtures:
- async_engine: module-scope AsyncEngine bound to TEST_DATABASE_URL
  (falls back to DATABASE_URL with _test suffix).
- async_session: function-scope AsyncSession inside a SAVEPOINT; rolled
  back at the end of each test for isolation.

Tests that need DB access should be marked @pytest.mark.db.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from grade_sight_api.config import settings


def _test_database_url() -> str:
    """Use TEST_DATABASE_URL if set, otherwise DATABASE_URL with _test suffix."""
    if settings.test_database_url is not None:
        return str(settings.test_database_url)
    base = str(settings.database_url)
    # Naive suffix strategy: append _test to the DB name.
    # Safe enough for Phase 1; revisit if multiple engineers share a dev DB.
    if base.endswith("/grade_sight"):
        return base.replace("/grade_sight", "/grade_sight_test")
    return base + "_test"


@pytest.fixture(scope="module")
async def async_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Module-scoped AsyncEngine bound to the test DB."""
    test_engine = create_async_engine(_test_database_url(), pool_pre_ping=True)
    try:
        yield test_engine
    finally:
        await test_engine.dispose()


@pytest.fixture
async def async_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Function-scoped AsyncSession wrapped in a SAVEPOINT for rollback isolation."""
    async with async_engine.connect() as connection:
        transaction = await connection.begin()
        session_factory = async_sessionmaker(bind=connection, expire_on_commit=False)
        async with session_factory() as session:
            try:
                yield session
            finally:
                await transaction.rollback()


@pytest.fixture
async def seed_organization(async_session: AsyncSession) -> None:
    """Stub factory — no-op until a test needs it."""
    _ = async_session
    return None


@pytest.fixture
async def seed_user(async_session: AsyncSession) -> None:
    """Stub factory — no-op until a test needs it."""
    _ = async_session
    return None
```

- [ ] **Step 2: Verify pytest collects without error**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run pytest --collect-only
```
Expected: no errors; pytest reports that no tests were collected. Exit code 5 (handled by our wrapped `test` script).

- [ ] **Step 3: Verify the wrapped test script exits 0**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter api test
```
Expected: the test script wraps pytest's exit 5 to 0. No output from the tail but overall exit 0.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/tests/conftest.py
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add pytest fixtures for DB-backed tests (scaffold, no assertions)

async_engine (module-scope, TEST_DATABASE_URL with fallback to
DATABASE_URL + _test suffix), async_session (function-scope, wrapped
in a SAVEPOINT for per-test rollback), and no-op seed_organization /
seed_user factory stubs. Per Spec 2: scaffolding only; tests land
with Spec 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Root and api db scripts

**Files:**
- Modify: `apps/api/package.json`, `package.json` (root)

- [ ] **Step 1: Add db scripts to `apps/api/package.json`**

Read `/Users/exexporerporer/Projects/Grade-Sight/apps/api/package.json`. Using Edit, add three new entries to the `scripts` object:

```json
    "db:migrate": "uv run alembic upgrade head",
    "db:makemigration": "uv run alembic revision --autogenerate -m",
    "db:rollback": "uv run alembic downgrade -1"
```

The final `scripts` block should look like:
```json
{
  "scripts": {
    "dev": "uv run uvicorn grade_sight_api.main:app --reload --port 8000",
    "build": "uv build",
    "start": "uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port ${PORT:-8000}",
    "lint": "uv run ruff check",
    "format": "uv run ruff format",
    "typecheck": "uv run mypy src",
    "test": "sh -c 'uv run pytest; ec=$?; [ $ec -eq 5 ] && exit 0 || exit $ec'",
    "db:migrate": "uv run alembic upgrade head",
    "db:makemigration": "uv run alembic revision --autogenerate -m",
    "db:rollback": "uv run alembic downgrade -1"
  }
}
```

- [ ] **Step 2: Add shortcut scripts to root `package.json`**

Read `/Users/exexporerporer/Projects/Grade-Sight/package.json`. Using Edit, add three entries to the `scripts` object:

```json
    "db:migrate": "pnpm --filter api db:migrate",
    "db:makemigration": "pnpm --filter api db:makemigration",
    "db:rollback": "pnpm --filter api db:rollback"
```

- [ ] **Step 3: Verify scripts work**

Run from repo root:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm db:migrate
```
Expected: Alembic reports already-at-head. Exit 0.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/package.json package.json
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add pnpm db:migrate / db:makemigration / db:rollback shortcuts

Root scripts delegate to apps/api via pnpm --filter. Local dev can
now run pnpm db:migrate without remembering the alembic CLI.
Matches the db:* pattern that later specs will extend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Documentation updates

**Files:**
- Modify: `apps/api/.env.example`, `README.md`

- [ ] **Step 1: Extend `apps/api/.env.example`**

Read `/Users/exexporerporer/Projects/Grade-Sight/apps/api/.env.example`. Replace its contents with (exactly):
```
# Required
API_PORT=8000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://grade_sight:grade_sight@localhost:5432/grade_sight

# Optional — defaults to DATABASE_URL with _test suffix if unset
TEST_DATABASE_URL=

# Future (uncomment when their spec lands):
# CLERK_JWKS_URL=
# ANTHROPIC_API_KEY=
# SENTRY_DSN=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

- [ ] **Step 2: Extend root `README.md`**

Read `/Users/exexporerporer/Projects/Grade-Sight/README.md`. Find the `## Prerequisites` section and add Docker as an additional prerequisite:

Change:
```markdown
- **uv** 0.5+ (`uv --version`). Install via `curl -LsSf https://astral.sh/uv/install.sh | sh`.
```

To:
```markdown
- **uv** 0.5+ (`uv --version`). Install via `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- **Docker** (for local Postgres). Docker Desktop or Docker Engine + Compose v2.
```

Then find the `## Install` section and after the existing block add a **Local Postgres** section:

```markdown
## Local Postgres

Bring up Postgres 16 in the background:

\`\`\`bash
docker compose up -d db
\`\`\`

Apply migrations:

\`\`\`bash
pnpm db:migrate
\`\`\`

Stop:

\`\`\`bash
docker compose down
\`\`\`

To wipe the local DB (reset to clean state):

\`\`\`bash
docker compose down -v
\`\`\`

## Migrations

\`\`\`bash
pnpm db:migrate              # alembic upgrade head
pnpm db:makemigration -- "your message"   # autogenerate a new migration
pnpm db:rollback             # alembic downgrade -1
\`\`\`

**Production migrations** are currently manual. To apply a new migration to
Railway's Postgres, set \`DATABASE_URL\` locally to Railway's
\`DATABASE_PUBLIC_URL\` and run \`pnpm db:migrate\`. See \`infra/README.md\`
for how to find the public URL.
```

(Use the Edit tool — replace `\`\`\`` with actual triple backticks in the file.)

- [ ] **Step 3: Verify scripts still pass**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm typecheck && pnpm lint && pnpm build
```
Expected: all three exit 0.

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/.env.example README.md
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Update .env.example and README for local Postgres + migrations

apps/api/.env.example now documents DATABASE_URL (with asyncpg driver
prefix) and TEST_DATABASE_URL. README adds Docker as a prerequisite,
documents docker compose flow for local Postgres, and documents the
manual production-migration procedure via DATABASE_PUBLIC_URL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Acceptance run (verification only, no commit)

**Files:** none — this task re-verifies the acceptance criteria end-to-end.

- [ ] **Step 1: Clean-slate install and migrate**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
docker compose down -v    # wipe DB volume
docker compose up -d db
sleep 10                  # wait for healthy
pnpm install              # bootstraps both ecosystems
pnpm db:migrate           # applies initial schema
```
Expected: everything exits 0. `alembic_version` table plus the 10 domain tables exist.

- [ ] **Step 2: Full verification suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
pnpm typecheck && echo "MARKER typecheck ok"
pnpm lint && echo "MARKER lint ok"
pnpm build && echo "MARKER build ok"
pnpm test && echo "MARKER test ok"
```
Expected: all four MARKER lines print.

- [ ] **Step 3: Boot probe with DB**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/exexporerporer/Projects/Grade-Sight
pnpm dev > /tmp/grade-sight-dev.log 2>&1 &
DEV_PID=$!
sleep 15
echo "--- /api/health ---"
curl -s http://localhost:8000/api/health
echo ""
echo "--- /api/db-health ---"
curl -s http://localhost:8000/api/db-health
echo ""
echo "--- web ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
kill -TERM $DEV_PID 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
sleep 2
```
Expected:
- `/api/health` returns `{"status":"ok","environment":"development"}`
- `/api/db-health` returns `{"status":"ok","latency_ms":<small int>}`
- `/` returns HTTP 200

- [ ] **Step 4: Walk the 13 acceptance criteria from the spec**

| # | Criterion | How to verify |
|---|---|---|
| 1 | Migration creates all 10 tables + 2 enums + indexes | `docker exec ... psql ... "\dt"` shows 11 tables (10 + alembic_version); `"\dT"` shows user_role, assessment_status |
| 2 | Migration is reversible | `pnpm db:rollback` (to base) then `pnpm db:migrate` cycle succeeds |
| 3 | Re-running autogenerate produces empty migration | Manual check: `uv run alembic revision --autogenerate -m "drift check"`; inspect the new file, confirm `upgrade()` body is just `pass`. Delete the file after |
| 4 | `/api/health` returns 200 | Step 3 above |
| 5 | `/api/db-health` returns 200 w/ latency; 503 when DB down | Step 3 above for 200; stop Postgres (`docker compose stop db`) and retry for 503; restart for subsequent checks |
| 6 | FastAPI fails at boot with missing DATABASE_URL | `unset DATABASE_URL && uv run python -c "from grade_sight_api.main import app"` — expect Pydantic validation error |
| 7 | `pnpm db:migrate / makemigration / rollback` work | Manually invoke each |
| 8 | No Spec 1 regressions | Step 2's markers all print |
| 9 | Models exist and re-exported | `uv run python -c "from grade_sight_api import models; print(models.__all__)"` — 12 names |
| 10 | `compose.yaml` brings up Postgres | Step 1 |
| 11 | `apps/api/.env.example` documents DB vars | `grep DATABASE_URL apps/api/.env.example` |
| 12 | README documents local DB + migrations | `grep -E "docker compose up \|pnpm db:migrate" README.md` |
| 13 | CLAUDE.md phase line update proposed (no commit) | Report to user; propose edit at end of plan |

For each, report pass/fail.

- [ ] **Step 5: Final report**

Report to the user:
- Total commits since plan start (should be 9: Tasks 1–9 each committed once).
- `git log --oneline origin/main..HEAD` since plan start.
- All 13 acceptance criteria pass/fail.
- Proposed CLAUDE.md edit for the phase line (for user approval, not automatic).

**No commit in Task 10.**

---

## Completion criteria (plan-level)

- All 13 acceptance criteria from the spec pass.
- Tasks 1–9 committed individually to `main`.
- `main` is ahead of `origin/main` by 9 commits; pushing is a separate user decision.
- Local Postgres runs; the api can connect to it; uvicorn binds and both health endpoints return 200.
- CLAUDE.md phase-line update is proposed for user approval (do not commit without approval per the "commits on request only" working agreement).
