"""Pydantic schemas for the student biography endpoint."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class StudentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    full_name: str
    first_name: str
    grade_level: int | None
    added_at: datetime


class BiographyStats(BaseModel):
    assessments_count: int
    average_score_percent: float | None
    problems_reviewed: int
    problems_missed: int
    patterns_detected: int
    recurring_count: int


class WeekBucket(BaseModel):
    week_start: date
    label: str
    count: int


class PatternTimelineRow(BaseModel):
    slug: str
    name: str
    category_slug: str
    category_name: str
    weeks: list[WeekBucket]
    total_count: int
    trend: Literal["recurring", "fading", "new", "one_off"]


class RecentAssessmentRow(BaseModel):
    id: UUID
    name: str
    uploaded_at: datetime
    mode: Literal["auto_grade", "with_key", "already_graded"]
    answer_key_name: str | None
    score_right: int
    score_total: int
    primary_error_pattern_name: str | None
    primary_error_pattern_count: int


class BiographySentence(BaseModel):
    kind: Literal["structured", "fallback"]
    eyebrow: str
    lead: str | None = None
    accent: str | None = None
    coda: str | None = None
    text: str | None = None


class StudentBiographyResponse(BaseModel):
    student: StudentSummary
    stats: BiographyStats
    weeks: list[date]
    pattern_timeline: list[PatternTimelineRow]
    recent_assessments: list[RecentAssessmentRow]
    sentence: BiographySentence
