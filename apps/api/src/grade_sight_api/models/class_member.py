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
