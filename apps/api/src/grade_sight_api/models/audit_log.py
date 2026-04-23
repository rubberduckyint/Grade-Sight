"""AuditLog — append-only record of data-access events.

No updated_at, no deleted_at. Written by the service layer (Spec 4).

Note: SQL column name is 'metadata' but Python attribute is event_metadata
— avoids collision with SQLAlchemy's Base.metadata.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
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
    event_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
