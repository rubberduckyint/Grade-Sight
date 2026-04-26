"""ErrorPattern — leaf node in the diagnostic taxonomy.

Patterns are the extensible level: new error types append here as we encounter
them. topics tags which math curricula a pattern applies to. severity_hint
optionally overrides the parent category's severity for this specific leaf.
Soft-deleteable (deleted_at) for "deprecation" — keeps historical diagnostic
records valid while removing the pattern from new classifications.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from .error_subcategory import ErrorSubcategory


class ErrorPattern(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "error_patterns"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    subcategory_id: Mapped[UUID] = mapped_column(
        ForeignKey("error_subcategories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_example: Mapped[str] = mapped_column(Text, nullable=False)
    topics: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        nullable=False,
        server_default=text("'{}'::text[]"),
    )
    severity_hint: Mapped[str] = mapped_column(nullable=False)

    subcategory: Mapped[ErrorSubcategory] = relationship(back_populates="patterns")
