"""Read-only error-patterns endpoint feeding the inline-edit pattern picker."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.user import User
from grade_sight_api.schemas.error_patterns import ErrorPatternOut

router = APIRouter(prefix="/api/error-patterns", tags=["error-patterns"])


@router.get("", response_model=list[ErrorPatternOut])
async def list_error_patterns(
    _user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ErrorPatternOut]:
    """Return active error patterns ordered by category then name."""
    rows = (
        await session.execute(
            select(ErrorPattern, ErrorCategory)
            .join(ErrorSubcategory, ErrorPattern.subcategory_id == ErrorSubcategory.id)
            .join(ErrorCategory, ErrorSubcategory.category_id == ErrorCategory.id)
            .where(ErrorPattern.deleted_at.is_(None))
            .order_by(ErrorCategory.slug, ErrorPattern.name)
        )
    ).all()

    return [
        ErrorPatternOut(
            id=pattern.id,
            slug=pattern.slug,
            name=pattern.name,
            category_slug=category.slug,
            category_name=category.name,
        )
        for pattern, category in rows
    ]
