"""ErrorCategory — top-level cognitive category in the diagnostic taxonomy.

Four categories total (Conceptual, Execution, Verification, Strategy). Stable
across all tenants and curricula. severity_rank powers the per-error tie-break
("when ambiguous, prefer the lighter category"); 1=lightest, 4=heaviest.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import TimestampMixin

if TYPE_CHECKING:
    from .error_subcategory import ErrorSubcategory


class ErrorCategory(Base, TimestampMixin):
    __tablename__ = "error_categories"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    distinguishing_marker: Mapped[str] = mapped_column(Text, nullable=False)
    severity_rank: Mapped[int] = mapped_column(nullable=False)

    subcategories: Mapped[list[ErrorSubcategory]] = relationship(
        back_populates="category"
    )
