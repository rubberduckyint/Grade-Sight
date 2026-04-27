"""Assessment model — uploaded graded work, owns N AssessmentPage rows.

Status enum drives the async diagnostic pipeline. Pages live in the
assessment_pages table (relationship .pages, ordered by page_number).
answer_key_id optional.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .answer_key import AnswerKey
    from .assessment_diagnosis import AssessmentDiagnosis
    from .assessment_page import AssessmentPage


class AssessmentStatus(enum.StrEnum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Assessment(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "assessments"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("students.id", ondelete="RESTRICT"),
        nullable=False,
    )
    class_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("classes.id", ondelete="RESTRICT"),
        nullable=True,
    )
    answer_key_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("answer_keys.id", ondelete="RESTRICT"),
        nullable=True,
    )
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus, name="assessment_status"),
        nullable=False,
        server_default=AssessmentStatus.pending.value,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("now()"),
    )
    already_graded: Mapped[bool] = mapped_column(
        nullable=False,
        server_default=text("false"),
    )
    review_all: Mapped[bool] = mapped_column(
        nullable=False,
        server_default=text("false"),
    )

    pages: Mapped[list[AssessmentPage]] = relationship(
        "AssessmentPage",
        back_populates="assessment",
        order_by="AssessmentPage.page_number",
        lazy="select",
    )
    diagnosis: Mapped[AssessmentDiagnosis | None] = relationship(
        "AssessmentDiagnosis",
        back_populates="assessment",
        uselist=False,
        lazy="select",
    )
    answer_key: Mapped[AnswerKey | None] = relationship(
        "AnswerKey",
        lazy="select",
    )
