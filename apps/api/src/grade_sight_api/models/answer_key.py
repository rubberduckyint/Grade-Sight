"""AnswerKey model — multi-page reference data for grading assessments.

Owns N AnswerKeyPage rows. Each Assessment can optionally reference one
AnswerKey via assessments.answer_key_id (FK from Spec 2).
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .answer_key_page import AnswerKeyPage


class AnswerKey(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "answer_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(nullable=False)

    pages: Mapped[list[AnswerKeyPage]] = relationship(
        "AnswerKeyPage",
        back_populates="answer_key",
        order_by="AnswerKeyPage.page_number",
        lazy="selectin",
    )
