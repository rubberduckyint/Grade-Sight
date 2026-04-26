"""Tests for the Claude retry helper."""

from __future__ import annotations

from unittest.mock import AsyncMock

import anthropic
import httpx
import pytest

from grade_sight_api.services.claude_service import _with_retries


def _make_connection_error() -> anthropic.APIConnectionError:
    """Build an APIConnectionError without a real underlying network failure."""
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.APIConnectionError(request=request)


async def test_with_retries_returns_on_first_success() -> None:
    fn = AsyncMock(return_value="ok")
    result = await _with_retries(fn, max_attempts=3)
    assert result == "ok"
    assert fn.await_count == 1


async def test_with_retries_retries_connection_error() -> None:
    err = _make_connection_error()
    fn = AsyncMock(side_effect=[err, err, "ok"])
    result = await _with_retries(fn, max_attempts=3, backoff_seconds=0)
    assert result == "ok"
    assert fn.await_count == 3


async def test_with_retries_gives_up_after_max_attempts() -> None:
    err = _make_connection_error()
    fn = AsyncMock(side_effect=err)
    with pytest.raises(anthropic.APIConnectionError):
        await _with_retries(fn, max_attempts=2, backoff_seconds=0)
    assert fn.await_count == 2


async def test_with_retries_does_not_retry_bad_request() -> None:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(400, request=request)
    err = anthropic.BadRequestError(
        message="bad", response=response, body={}
    )
    fn = AsyncMock(side_effect=err)
    with pytest.raises(anthropic.BadRequestError):
        await _with_retries(fn, max_attempts=3, backoff_seconds=0)
    assert fn.await_count == 1
