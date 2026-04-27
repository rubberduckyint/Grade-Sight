"""AssessmentDiagnosis — engine output for one Assessment.

1:1 with Assessment in v1 (UNIQUE constraint on assessment_id; re-run
deferred to a follow-up spec). Owns N ProblemObservation rows.

Model + prompt_version stamped on every row so we can bucket results by
prompt era when we iterate. Cost / token / cache columns power the
existing Claude cost analytics.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Numeric, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .assessment import Assessment
    from .problem_observation import ProblemObservation


class AssessmentDiagnosis(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "assessment_diagnoses"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    model: Mapped[str] = mapped_column(nullable=False)
    prompt_version: Mapped[str] = mapped_column(nullable=False)
    tokens_input: Mapped[int] = mapped_column(nullable=False)
    tokens_output: Mapped[int] = mapped_column(nullable=False)
    tokens_cache_read: Mapped[int | None] = mapped_column(nullable=True)
    tokens_cache_creation: Mapped[int | None] = mapped_column(nullable=True)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    latency_ms: Mapped[int] = mapped_column(nullable=False)
    overall_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_problems_seen: Mapped[int | None] = mapped_column(nullable=True)
    analysis_mode: Mapped[str] = mapped_column(
        nullable=False,
        server_default=text("'auto_grade'"),
    )

    assessment: Mapped[Assessment] = relationship(
        "Assessment",
        back_populates="diagnosis",
        lazy="select",
    )
    observations: Mapped[list[ProblemObservation]] = relationship(
        "ProblemObservation",
        back_populates="diagnosis",
        order_by="ProblemObservation.problem_number",
        lazy="selectin",
    )
