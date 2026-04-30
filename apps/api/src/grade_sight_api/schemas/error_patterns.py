"""Pydantic schemas for error patterns."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ErrorPatternOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    category_slug: str
    category_name: str
