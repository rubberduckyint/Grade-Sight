"""Pydantic schemas for the students router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    full_name: str
    grade_level: int = Field(..., ge=5, le=12)


class StudentResponse(BaseModel):
    id: UUID
    full_name: str
    grade_level: int | None
    created_at: datetime


class StudentListResponse(BaseModel):
    students: list[StudentResponse]
