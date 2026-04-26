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
from collections.abc import Awaitable, Callable
from decimal import Decimal

import anthropic

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
