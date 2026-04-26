"""ErrorSubcategory — second level of the diagnostic taxonomy.

Sub-categories live under a parent ErrorCategory. Slug is globally unique
(not just within parent) for clean cross-tree lookup.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import TimestampMixin

if TYPE_CHECKING:
    from .error_category import ErrorCategory
    from .error_pattern import ErrorPattern


class ErrorSubcategory(Base, TimestampMixin):
    __tablename__ = "error_subcategories"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("error_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)

    category: Mapped[ErrorCategory] = relationship(back_populates="subcategories")
    patterns: Mapped[list[ErrorPattern]] = relationship(
        back_populates="subcategory"
    )
