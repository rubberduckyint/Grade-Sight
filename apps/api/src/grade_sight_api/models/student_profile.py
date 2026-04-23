"""StudentProfile model (non-PII).

1:1 with Student. Thin by design — rich learning columns arrive with the
diagnostic engine spec. organization_id denormalized from students for
tenant-scoped queries.

Note: SQL column name is 'metadata' but Python attribute is
profile_metadata — avoids collision with SQLAlchemy's Base.metadata.
"""

from __future__ import annotations

from typing import Any
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
    profile_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
    )
