"""AnswerKeyPage — one image of an answer key.

Mirror of AssessmentPage. AnswerKey can have N pages, each with its own
R2 key + filename. (answer_key_id, page_number) is unique.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .answer_key import AnswerKey


class AnswerKeyPage(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "answer_key_pages"
    __table_args__ = (
        UniqueConstraint(
            "answer_key_id",
            "page_number",
            name="uq_answer_key_pages_answer_key_id_page_number",
        ),
        Index("ix_answer_key_pages_answer_key_id", "answer_key_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    answer_key_id: Mapped[UUID] = mapped_column(
        ForeignKey("answer_keys.id", ondelete="RESTRICT"),
        nullable=False,
    )
    page_number: Mapped[int] = mapped_column(nullable=False)
    s3_url: Mapped[str] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(nullable=False)
    content_type: Mapped[str] = mapped_column(nullable=False)

    answer_key: Mapped[AnswerKey] = relationship(
        "AnswerKey",
        back_populates="pages",
        lazy="select",
    )
