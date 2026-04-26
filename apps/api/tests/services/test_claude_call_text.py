"""Tests for claude_service.call_text."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


def _fake_response(text: str, tokens_in: int, tokens_out: int) -> MagicMock:
    response = MagicMock()
    response.content = [MagicMock(text=text)]
    response.usage = MagicMock(input_tokens=tokens_in, output_tokens=tokens_out)
    return response


async def test_call_text_success_writes_log(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )

    fake = _fake_response("pong", tokens_in=4, tokens_out=2)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=AsyncMock(return_value=fake))),
    ):
        response = await claude_service.call_text(
            ctx=ctx,
            model="claude-haiku-4-5-20251001",
            system="You are a test bot.",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=10,
            db=async_session,
        )

    assert response.text == "pong"
    assert response.tokens_input == 4
    assert response.tokens_output == 2

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is True
    assert rows[0].tokens_input == 4
    assert rows[0].tokens_output == 2
    assert rows[0].model == "claude-haiku-4-5-20251001"


async def test_call_text_failure_writes_failure_log(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="test_text",
        contains_pii=False,
    )

    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(400, request=request)
    err = anthropic.BadRequestError(message="oops", response=response, body={})

    with (
        patch.object(
            claude_service, "_get_client",
            return_value=MagicMock(messages=MagicMock(create=AsyncMock(side_effect=err))),
        ),
        pytest.raises(claude_service.ClaudeServiceError),
    ):
        await claude_service.call_text(
            ctx=ctx,
            model="claude-haiku-4-5-20251001",
            system="x",
            messages=[{"role": "user", "content": "x"}],
            max_tokens=10,
            db=async_session,
        )

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is False
    assert "BadRequestError" in (rows[0].error_message or "")
