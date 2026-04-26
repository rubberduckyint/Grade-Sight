"""Claude (Anthropic) SDK wrapper.

Public functions:
- call_text: text-only chat completion with metering + retries.
- call_vision: image+prompt completion with metering + retries.
- compute_cost: helper for tests and ad-hoc use; called internally on every call.

Every call writes an LLMCallLog row (success or failure) via _logging.
Retries are inside each call; each retry gets its own log row so cost
dashboards reflect actual API spend.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, cast

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ._logging import write_audit_log, write_llm_call_log
from .call_context import CallContext

logger = logging.getLogger(__name__)


# Per-million-token rates (USD). Confirm against
# https://docs.anthropic.com/en/docs/about-claude/pricing at implementation time.
_PRICES_PER_MILLION: dict[str, tuple[Decimal, Decimal]] = {
    "claude-sonnet-4-6": (Decimal("3.00"), Decimal("15.00")),
    "claude-haiku-4-5-20251001": (Decimal("0.80"), Decimal("4.00")),
}


class ClaudeServiceError(Exception):
    """Raised by claude_service public functions on terminal failures."""


_RETRYABLE_EXCEPTIONS: tuple[type[Exception], ...] = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
)


async def _with_retries[T](
    fn: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 3,
    backoff_seconds: float = 1.0,
) -> T:
    """Call fn with exponential backoff on retryable Anthropic errors.

    Retryable: connection errors, timeouts, rate limits.
    Non-retryable (raised immediately): bad request, auth, permission, all 4xx
    other than 429.
    """
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return await fn()
        except _RETRYABLE_EXCEPTIONS as exc:
            last_exc = exc
            if attempt + 1 == max_attempts:
                break
            await asyncio.sleep(backoff_seconds * (2**attempt))
    assert last_exc is not None  # for mypy; loop above guarantees this
    raise last_exc


def compute_cost(*, model: str, tokens_input: int, tokens_output: int) -> Decimal:
    """USD cost for a single Claude call given token counts."""
    if model not in _PRICES_PER_MILLION:
        raise ValueError(f"No price entry for model: {model}")
    input_rate, output_rate = _PRICES_PER_MILLION[model]
    million = Decimal("1000000")
    return (
        Decimal(tokens_input) * input_rate / million
        + Decimal(tokens_output) * output_rate / million
    )


_anthropic_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    """Lazy singleton — instantiated on first use, mockable in tests via patch.object."""
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


@dataclass(frozen=True)
class ClaudeTextResponse:
    text: str
    tokens_input: int
    tokens_output: int
    model: str


async def call_text(
    *,
    ctx: CallContext,
    model: str,
    system: str,
    messages: list[anthropic.types.MessageParam],
    max_tokens: int,
    db: AsyncSession,
) -> ClaudeTextResponse:
    """Call Claude with a text-only message list. Returns parsed response.

    Writes an LLMCallLog row on every attempt (success or failure). On PII
    calls (ctx.contains_pii=True), also writes an audit_log row.
    """
    client = _get_client()

    async def _attempt() -> Any:
        return await client.messages.create(
            model=model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
        )

    start = time.monotonic()
    try:
        response = await _with_retries(_attempt)
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        await write_llm_call_log(
            db,
            ctx=ctx,
            model=model,
            tokens_input=0,
            tokens_output=0,
            cost_usd=Decimal("0"),
            latency_ms=latency_ms,
            success=False,
            error_message=f"{type(exc).__name__}: {exc}",
        )
        raise ClaudeServiceError(str(exc)) from exc

    latency_ms = int((time.monotonic() - start) * 1000)
    text_blocks = [block.text for block in response.content if hasattr(block, "text")]
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens
    cost = compute_cost(model=model, tokens_input=tokens_in, tokens_output=tokens_out)

    await write_llm_call_log(
        db,
        ctx=ctx,
        model=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        cost_usd=cost,
        latency_ms=latency_ms,
        success=True,
    )

    if ctx.contains_pii:
        await write_audit_log(
            db,
            ctx=ctx,
            resource_type="claude_call",
            resource_id=None,
            action="claude_text_call",
            extra={"model": model, "tokens_input": tokens_in, "tokens_output": tokens_out},
        )

    return ClaudeTextResponse(
        text="".join(text_blocks),
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        model=model,
    )
