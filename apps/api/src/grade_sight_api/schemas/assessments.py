"""Pydantic schemas for the assessments router."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from ..models.assessment import AssessmentStatus
from grade_sight_api.schemas.diagnostic_reviews import DiagnosticReviewOut


class AssessmentFile(BaseModel):
    filename: str
    content_type: str


class AssessmentCreateRequest(BaseModel):
    student_id: UUID
    files: list[AssessmentFile]
    answer_key_id: UUID | None = None
    already_graded: bool = False
    review_all: bool = False


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


class ProblemObservationResponse(BaseModel):
    id: UUID
    problem_number: int
    page_number: int
    student_answer: str
    correct_answer: str
    is_correct: bool
    error_pattern_slug: str | None
    error_pattern_name: str | None
    error_category_slug: str | None
    error_description: str | None
    solution_steps: str | None
    review: DiagnosticReviewOut | None = None


class AssessmentDiagnosisResponse(BaseModel):
    id: UUID
    model: str
    overall_summary: str | None
    cost_usd: float
    latency_ms: int
    created_at: datetime
    problems: list[ProblemObservationResponse]
    analysis_mode: Literal["auto_grade", "with_key", "already_graded"]
    total_problems_seen: int | None


class AssessmentDetailAnswerKey(BaseModel):
    id: UUID
    name: str
    page_count: int


class AssessmentDetailResponse(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    status: AssessmentStatus
    uploaded_at: datetime
    pages: list[AssessmentDetailPage]
    diagnosis: AssessmentDiagnosisResponse | None
    answer_key: AssessmentDetailAnswerKey | None
