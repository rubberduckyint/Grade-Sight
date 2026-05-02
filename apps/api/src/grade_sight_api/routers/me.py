"""GET /api/me — return the current authenticated user.
POST /api/me/delete — soft-delete the authenticated user + their owned tenant data.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.user import User
from ..schemas.me import OrganizationResponse, UserResponse
from ..services import account_deletion_service

router = APIRouter()


@router.get("/api/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> UserResponse:
    """Return the current user + (optional) organization.

    Loads the organization via a second query rather than ORM relationship
    navigation — models don't yet define a User.organization relationship
    (deferred to when it's actually needed in multiple places).
    """
    org_response: OrganizationResponse | None = None
    if user.organization_id is not None:
        from ..models.organization import Organization

        result = await db.execute(
            select(Organization).where(
                Organization.id == user.organization_id,
                Organization.deleted_at.is_(None),
            )
        )
        org = result.scalar_one_or_none()
        if org is not None:
            org_response = OrganizationResponse.model_validate(org)

    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        organization=org_response,
        created_at=user.created_at,
    )


@router.post("/api/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_self(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Soft-delete the authenticated user + their owned tenant data."""
    try:
        await account_deletion_service.soft_delete_user(user=user, db=db)
    except account_deletion_service.MultiTeacherOrgError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a teacher account in a multi-teacher org. Contact support.",
        )
