"""Pydantic schemas for diagnostic reviews."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class DiagnosticReviewCreate(BaseModel):
    problem_number: int
    override_pattern_id: UUID | None = None
    marked_correct: bool = False
    note: str | None = None

    @model_validator(mode="after")
    def validate_one_action(self) -> "DiagnosticReviewCreate":
        if self.marked_correct and self.override_pattern_id is not None:
            raise ValueError("Cannot both mark correct and override pattern")
        if not self.marked_correct and self.override_pattern_id is None:
            raise ValueError("Must either mark correct or set override pattern")
        return self


class DiagnosticReviewUpdate(BaseModel):
    """All fields optional. Router merges into the existing record then re-runs the XOR validator on merged state."""

    override_pattern_id: UUID | None = None
    marked_correct: bool | None = None
    note: str | None = None


class DiagnosticReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    marked_correct: bool
    override_pattern_id: UUID | None
    override_pattern_slug: str | None
    override_pattern_name: str | None
    note: str | None
    reviewed_at: datetime
    reviewed_by_name: str
