"""Pydantic schemas for the classes router."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ClassCreate(BaseModel):
    name: str
    subject: str | None = None
    grade_level: str | None = None


class ClassUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    archived: bool | None = None


class ClassListItem(BaseModel):
    id: UUID
    name: str
    subject: str | None
    grade_level: str | None
    archived: bool
    student_count: int
    created_at: datetime


class ClassListResponse(BaseModel):
    classes: list[ClassListItem]
    has_archived: bool


class ClassRosterMember(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    student_grade_level: str | None
    joined_at: datetime


class ClassDetailResponse(BaseModel):
    id: UUID
    name: str
    subject: str | None
    grade_level: str | None
    archived: bool
    roster: list[ClassRosterMember]
    created_at: datetime


class AddMembersRequest(BaseModel):
    student_ids: list[UUID]
