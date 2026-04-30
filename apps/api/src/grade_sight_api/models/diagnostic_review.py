"""Diagnostic review — teacher override of an auto-graded problem."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import TimestampMixin

if TYPE_CHECKING:
    from .assessment import Assessment
    from .error_pattern import ErrorPattern
    from .user import User


class DiagnosticReview(Base, TimestampMixin):
    __tablename__ = "diagnostic_reviews"

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    problem_number: Mapped[int] = mapped_column(Integer, nullable=False)
    original_pattern_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("error_patterns.id"),
        nullable=True,
    )
    override_pattern_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("error_patterns.id"),
        nullable=True,
    )
    marked_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    reviewed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    assessment: Mapped["Assessment"] = relationship(back_populates="diagnostic_reviews")
    override_pattern: Mapped["ErrorPattern | None"] = relationship(
        foreign_keys=[override_pattern_id],
    )
    original_pattern: Mapped["ErrorPattern | None"] = relationship(
        foreign_keys=[original_pattern_id],
    )
    reviewer: Mapped["User"] = relationship(foreign_keys=[reviewed_by])

    __table_args__ = (
        Index(
            "ix_diagnostic_reviews_active_unique",
            "assessment_id",
            "problem_number",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
