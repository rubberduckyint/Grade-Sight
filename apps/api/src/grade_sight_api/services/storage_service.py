"""Cloudflare R2 wrapper (S3-compatible).

Public functions:
- get_upload_url: presigned PUT URL for direct browser-to-R2 upload.
- get_download_url: presigned GET URL for direct browser download.
- delete_object: hard-delete an object.

Every call writes an audit_log row. R2-specific because we'd configure the
endpoint URL to https://<account>.r2.cloudflarestorage.com; for AWS S3 the
same code with a different endpoint URL works.
"""

from __future__ import annotations

import logging
from typing import Any, cast

import aioboto3  # type: ignore[import-untyped]
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ._logging import write_audit_log
from .call_context import CallContext

logger = logging.getLogger(__name__)


class StorageServiceError(Exception):
    """Raised on terminal R2 failures."""


_session: aioboto3.Session | None = None


def _get_session() -> aioboto3.Session:
    """Lazy singleton — instantiated on first use."""
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


def _client_kwargs() -> dict[str, Any]:
    return {
        "service_name": "s3",
        "endpoint_url": settings.r2_endpoint_url,
        "aws_access_key_id": settings.r2_access_key_id,
        "aws_secret_access_key": settings.r2_secret_access_key,
        "region_name": "auto",
    }


async def get_upload_url(
    *,
    ctx: CallContext,
    key: str,
    content_type: str,
    expires_in: int = 600,
    db: AsyncSession,
) -> str:
    """Return a presigned PUT URL for direct browser-to-R2 upload.

    Writes an audit_log row capturing the key issued.
    """
    session = _get_session()
    async with session.client(**_client_kwargs()) as client:
        url = cast(
            str,
            await client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": settings.r2_bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            ),
        )

    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="storage_object",
        resource_id=None,
        action="presigned_upload_issued",
        extra={"key": key, "content_type": content_type, "expires_in": expires_in},
    )
    return url


async def get_download_url(
    *,
    ctx: CallContext,
    key: str,
    expires_in: int = 600,
    db: AsyncSession,
) -> str:
    """Return a presigned GET URL for direct browser download from R2."""
    session = _get_session()
    async with session.client(**_client_kwargs()) as client:
        url = cast(str, await client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket, "Key": key},
            ExpiresIn=expires_in,
        ))

    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="storage_object",
        resource_id=None,
        action="presigned_download_issued",
        extra={"key": key, "expires_in": expires_in},
    )
    return url


async def delete_object(
    *,
    ctx: CallContext,
    key: str,
    db: AsyncSession,
) -> None:
    """Hard-delete an object from R2."""
    session = _get_session()
    async with session.client(**_client_kwargs()) as client:
        await client.delete_object(
            Bucket=settings.r2_bucket,
            Key=key,
        )

    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="storage_object",
        resource_id=None,
        action="storage_object_deleted",
        extra={"key": key},
    )
