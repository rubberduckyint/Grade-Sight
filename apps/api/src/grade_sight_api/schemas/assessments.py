"""Pydantic schemas for the assessments router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from ..models.assessment import AssessmentStatus


class AssessmentFile(BaseModel):
    filename: str
    content_type: str


class AssessmentCreateRequest(BaseModel):
    student_id: UUID
    files: list[AssessmentFile]


class AssessmentPageUploadIntent(BaseModel):
    page_number: int
    key: str
    upload_url: str


class AssessmentCreateResponse(BaseModel):
    assessment_id: UUID
    pages: list[AssessmentPageUploadIntent]


class AssessmentListItem(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    page_count: int
    first_page_thumbnail_url: str
    status: AssessmentStatus
    uploaded_at: datetime


class AssessmentListResponse(BaseModel):
    assessments: list[AssessmentListItem]


class AssessmentDetailPage(BaseModel):
    page_number: int
    original_filename: str
    view_url: str


class AssessmentDetailResponse(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    status: AssessmentStatus
    uploaded_at: datetime
    pages: list[AssessmentDetailPage]
