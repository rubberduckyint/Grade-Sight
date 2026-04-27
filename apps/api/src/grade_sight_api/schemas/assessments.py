"""Pydantic schemas for the assessments router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from ..models.assessment import AssessmentStatus


class AssessmentCreateRequest(BaseModel):
    student_id: UUID
    original_filename: str
    content_type: str


class AssessmentCreateResponse(BaseModel):
    assessment_id: UUID
    upload_url: str
    key: str


class AssessmentListItem(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    original_filename: str
    status: AssessmentStatus
    uploaded_at: datetime


class AssessmentListResponse(BaseModel):
    assessments: list[AssessmentListItem]
