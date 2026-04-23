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
