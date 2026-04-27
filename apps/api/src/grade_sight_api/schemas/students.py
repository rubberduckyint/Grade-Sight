"""Pydantic schemas for the students router."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class StudentCreate(BaseModel):
    full_name: str
    date_of_birth: date | None = None


class StudentResponse(BaseModel):
    id: UUID
    full_name: str
    date_of_birth: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentListResponse(BaseModel):
    students: list[StudentResponse]
