"""Response schemas for the /api/me endpoint."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from ..models.user import UserRole


class OrganizationResponse(BaseModel):
    """Nested org in /api/me. Just id + name; no clerk_org_id."""

    id: UUID
    name: str
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    """Response shape for GET /api/me.

    Intentionally omits clerk_id, consent_flags, updated_at, deleted_at.
    """

    id: UUID
    email: str
    role: UserRole
    first_name: str | None
    last_name: str | None
    organization: OrganizationResponse | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
