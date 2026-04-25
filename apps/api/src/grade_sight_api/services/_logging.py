"""Shared logging helpers for the service layer.

Every external-service call writes through write_audit_log (for student-data
access events) or write_llm_call_log (for Claude calls). Centralized here so
audit trail conventions stay consistent and a future privacy review can point
at one file.

Underscore-prefixed because nothing outside services/ should import these.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit_log import AuditLog
from ..models.llm_call_log import LLMCallLog
from .call_context import CallContext


async def write_audit_log(
    db: AsyncSession,
    *,
    ctx: CallContext,
    resource_type: str,
    resource_id: UUID | None,
    action: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Append an AuditLog row for a student-data access event.

    Always records ctx.request_type and (when present) ctx.audit_reason in
    metadata. Caller's `extra` dict is merged in.
    """
    if not action:
        raise ValueError("action is required")

    metadata: dict[str, Any] = {"request_type": ctx.request_type}
    if ctx.audit_reason:
        metadata["audit_reason"] = ctx.audit_reason
    if extra:
        metadata.update(extra)

    entry = AuditLog(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        event_metadata=metadata,
    )
    db.add(entry)
    await db.flush()


async def write_llm_call_log(
    db: AsyncSession,
    *,
    ctx: CallContext,
    model: str,
    tokens_input: int,
    tokens_output: int,
    cost_usd: Decimal,
    latency_ms: int,
    success: bool,
    error_message: str | None = None,
) -> None:
    """Append an LLMCallLog row for a Claude call (success or failure).

    Failures are logged too — cost dashboards reflect all attempts and
    error rates surface in the same view as throughput.
    """
    entry = LLMCallLog(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        model=model,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        request_type=ctx.request_type,
        success=success,
        error_message=error_message,
    )
    db.add(entry)
    await db.flush()
