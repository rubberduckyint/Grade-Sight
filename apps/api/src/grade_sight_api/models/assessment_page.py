"""AssessmentPage — one image (one scanned sheet) of an Assessment.

An Assessment can have N pages, each with its own R2 key + filename. Page
ordering is 1-indexed; (assessment_id, page_number) is unique.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .assessment import Assessment


class AssessmentPage(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "assessment_pages"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "page_number",
            name="uq_assessment_pages_assessment_id_page_number",
        ),
        Index("ix_assessment_pages_assessment_id", "assessment_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    page_number: Mapped[int] = mapped_column(nullable=False)
    s3_url: Mapped[str] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(nullable=False)
    content_type: Mapped[str] = mapped_column(nullable=False)

    assessment: Mapped[Assessment] = relationship(
        "Assessment",
        back_populates="pages",
        lazy="select",
    )
