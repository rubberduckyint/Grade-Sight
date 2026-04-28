"""Pydantic schemas for the answer_keys router."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AnswerKeyFile(BaseModel):
    filename: str
    content_type: str


class AnswerKeyCreateRequest(BaseModel):
    name: str
    files: list[AnswerKeyFile]


class AnswerKeyPageUploadIntent(BaseModel):
    page_number: int
    key: str
    upload_url: str


class AnswerKeyCreateResponse(BaseModel):
    answer_key_id: UUID
    pages: list[AnswerKeyPageUploadIntent]


class AnswerKeySummary(BaseModel):
    id: UUID
    name: str
    page_count: int
    first_page_thumbnail_url: str
    created_at: datetime


class AnswerKeyListResponse(BaseModel):
    answer_keys: list[AnswerKeySummary]


class AnswerKeyDetailPage(BaseModel):
    page_number: int
    original_filename: str
    view_url: str


class AnswerKeyDetailResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    pages: list[AnswerKeyDetailPage]
