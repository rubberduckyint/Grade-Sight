"""ProblemObservation — one engine-classified problem inside a diagnosis.

is_correct=true rows have only student_answer + correct_answer populated
(usually equal). is_correct=false rows additionally have error_description
and solution_steps. error_pattern_id is set when the engine matched the
error to a taxonomy slug; nullable when the engine couldn't classify but
still saw the wrong answer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    from .assessment_diagnosis import AssessmentDiagnosis


class ProblemObservation(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "problem_observations"
    __table_args__ = (
        UniqueConstraint(
            "diagnosis_id",
            "problem_number",
            name="uq_problem_observations_diagnosis_id_problem_number",
        ),
        Index("ix_problem_observations_diagnosis_id", "diagnosis_id"),
        Index("ix_problem_observations_error_pattern_id", "error_pattern_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    diagnosis_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessment_diagnoses.id", ondelete="RESTRICT"),
        nullable=False,
    )
    problem_number: Mapped[int] = mapped_column(nullable=False)
    page_number: Mapped[int] = mapped_column(nullable=False)
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(nullable=False)
    error_pattern_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("error_patterns.id", ondelete="RESTRICT"),
        nullable=True,
    )
    error_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution_steps: Mapped[str | None] = mapped_column(Text, nullable=True)

    diagnosis: Mapped[AssessmentDiagnosis] = relationship(
        "AssessmentDiagnosis",
        back_populates="observations",
        lazy="select",
    )
