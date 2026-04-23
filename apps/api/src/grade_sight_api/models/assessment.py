"""Assessment model — uploaded graded work.

Status enum drives the async diagnostic pipeline. s3_url + original_filename
locate the uploaded image. answer_key_id optional (can be uploaded later).
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


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
    s3_url: Mapped[str] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus, name="assessment_status"),
        nullable=False,
        server_default=AssessmentStatus.pending.value,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("now()"),
    )
