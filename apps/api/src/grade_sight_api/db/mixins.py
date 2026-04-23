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
