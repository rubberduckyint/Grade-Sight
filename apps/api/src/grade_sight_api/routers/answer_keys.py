"""Answer keys router — list, create, detail, delete.

Mirror of routers/assessments.py for AnswerKey + AnswerKeyPage. Tenant-
scoped via user.organization_id. POST creates the AnswerKey + N
AnswerKeyPage rows in one transaction and returns N presigned PUT URLs;
the browser uploads bytes directly to R2.

R2 key shape: answer-keys/{org_id}/{answer_key_id}/page-{nnn}.{ext}.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
from ..models.user import User
from ..schemas.answer_keys import (
    AnswerKeyCreateRequest,
    AnswerKeyCreateResponse,
    AnswerKeyDetailPage,
    AnswerKeyDetailResponse,
    AnswerKeyListResponse,
    AnswerKeyPageUploadIntent,
    AnswerKeySummary,
)
from ..services import storage_service
from ..services.call_context import CallContext

MAX_PAGES_PER_KEY = 20

router = APIRouter()


def _safe_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lstrip(".").lower()
    return suffix or "bin"


@router.get("/api/answer-keys", response_model=AnswerKeyListResponse)
async def list_answer_keys(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AnswerKeyListResponse:
    """List user's org's answer keys, ordered by created_at DESC."""
    if user.organization_id is None:
        return AnswerKeyListResponse(answer_keys=[])

    page_count_subq = (
        select(
            AnswerKeyPage.answer_key_id.label("answer_key_id"),
            func.count(AnswerKeyPage.id).label("page_count"),
        )
        .where(AnswerKeyPage.deleted_at.is_(None))
        .group_by(AnswerKeyPage.answer_key_id)
        .subquery()
    )
    first_page_subq = (
        select(
            AnswerKeyPage.answer_key_id.label("answer_key_id"),
            AnswerKeyPage.s3_url.label("first_page_key"),
        )
        .where(
            AnswerKeyPage.page_number == 1,
            AnswerKeyPage.deleted_at.is_(None),
        )
        .subquery()
    )

    result = await db.execute(
        select(
            AnswerKey,
            page_count_subq.c.page_count,
            first_page_subq.c.first_page_key,
        )
        .join(
            page_count_subq,
            AnswerKey.id == page_count_subq.c.answer_key_id,
            isouter=True,
        )
        .join(
            first_page_subq,
            AnswerKey.id == first_page_subq.c.answer_key_id,
            isouter=True,
        )
        .where(
            AnswerKey.organization_id == user.organization_id,
            AnswerKey.deleted_at.is_(None),
        )
        .order_by(AnswerKey.created_at.desc())
        .limit(limit)
    )

    items: list[AnswerKeySummary] = []
    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="answer_key_list_thumbnails",
        contains_pii=False,
        audit_reason="render answer key picker thumbnails",
    )
    for key_row, page_count, first_page_key in result.all():
        if first_page_key is None:
            continue
        thumb_url = await storage_service.get_download_url(
            ctx=ctx,
            key=first_page_key,
            db=db,
        )
        items.append(
            AnswerKeySummary(
                id=key_row.id,
                name=key_row.name,
                page_count=int(page_count or 0),
                first_page_thumbnail_url=thumb_url,
                created_at=key_row.created_at,
            )
        )
    return AnswerKeyListResponse(answer_keys=items)


@router.post(
    "/api/answer-keys",
    response_model=AnswerKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_answer_key(
    payload: AnswerKeyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AnswerKeyCreateResponse:
    """Create an AnswerKey + N AnswerKeyPage rows; return N presigned PUT URLs."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name is required",
        )
    if not payload.files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="files is required",
        )
    if len(payload.files) > MAX_PAGES_PER_KEY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"max {MAX_PAGES_PER_KEY} pages per answer key",
        )
    for f in payload.files:
        if not f.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="content_type must be image/*",
            )
        if not f.filename.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="filename is required",
            )

    answer_key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=user.organization_id,
        name=name,
    )
    db.add(answer_key)
    await db.flush()

    pages: list[AnswerKeyPage] = []
    for index, f in enumerate(payload.files, start=1):
        filename = f.filename.strip()
        ext = _safe_extension(filename)
        key = (
            f"answer-keys/{user.organization_id}/"
            f"{answer_key.id}/page-{index:03d}.{ext}"
        )
        page = AnswerKeyPage(
            answer_key_id=answer_key.id,
            page_number=index,
            s3_url=key,
            original_filename=filename,
            content_type=f.content_type,
            organization_id=user.organization_id,
        )
        db.add(page)
        pages.append(page)
    await db.flush()

    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="answer_key_upload_url",
        contains_pii=False,
        audit_reason="upload answer key image",
    )
    intents: list[AnswerKeyPageUploadIntent] = []
    for page, f in zip(pages, payload.files, strict=True):
        upload_url = await storage_service.get_upload_url(
            ctx=ctx,
            key=page.s3_url,
            content_type=f.content_type,
            db=db,
        )
        intents.append(
            AnswerKeyPageUploadIntent(
                page_number=page.page_number,
                key=page.s3_url,
                upload_url=upload_url,
            )
        )

    return AnswerKeyCreateResponse(
        answer_key_id=answer_key.id,
        pages=intents,
    )


@router.get(
    "/api/answer-keys/{answer_key_id}",
    response_model=AnswerKeyDetailResponse,
)
async def get_answer_key_detail(
    answer_key_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AnswerKeyDetailResponse:
    """Full answer key detail with one presigned GET per page."""
    result = await db.execute(
        select(AnswerKey).where(
            AnswerKey.id == answer_key_id,
            AnswerKey.deleted_at.is_(None),
        )
    )
    answer_key = result.scalar_one_or_none()
    if answer_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="answer key not found",
        )
    if answer_key.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="answer key does not belong to your organization",
        )

    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    pages_result = await db.execute(
        select(AnswerKeyPage)
        .where(
            AnswerKeyPage.answer_key_id == answer_key.id,
            AnswerKeyPage.deleted_at.is_(None),
        )
        .order_by(AnswerKeyPage.page_number)
    )
    pages = pages_result.scalars().all()

    ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="answer_key_detail",
        contains_pii=False,
        audit_reason="render answer key detail page",
    )
    detail_pages: list[AnswerKeyDetailPage] = []
    for p in pages:
        view_url = await storage_service.get_download_url(
            ctx=ctx, key=p.s3_url, db=db
        )
        detail_pages.append(
            AnswerKeyDetailPage(
                page_number=p.page_number,
                original_filename=p.original_filename,
                view_url=view_url,
            )
        )

    return AnswerKeyDetailResponse(
        id=answer_key.id,
        name=answer_key.name,
        created_at=answer_key.created_at,
        pages=detail_pages,
    )


@router.delete(
    "/api/answer-keys/{answer_key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_answer_key(
    answer_key_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Soft-delete the answer key. Existing assessments referencing it
    still resolve via FK (deleted_at is not filtered when the engine
    loads the key)."""
    result = await db.execute(
        select(AnswerKey).where(
            AnswerKey.id == answer_key_id,
            AnswerKey.deleted_at.is_(None),
        )
    )
    answer_key = result.scalar_one_or_none()
    if answer_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="answer key not found",
        )
    if answer_key.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="answer key does not belong to your organization",
        )
    answer_key.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    await db.flush()
