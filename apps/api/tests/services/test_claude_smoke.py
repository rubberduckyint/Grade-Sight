"""Real Claude API smoke test. Runs only when INTEGRATION=1.

Costs approximately $0.0001 per invocation (Haiku, ping/pong).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext

pytestmark = pytest.mark.integration


@pytest.fixture
def integration_enabled() -> None:
    if os.environ.get("INTEGRATION") != "1":
        pytest.skip("set INTEGRATION=1 to run integration tests")


async def test_claude_text_real_call(
    integration_enabled: None,
    async_session: AsyncSession,
) -> None:
    org = Organization(name="Smoke Test Org")
    async_session.add(org)
    await async_session.flush()

    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="smoke_test",
        contains_pii=False,
    )
    response = await claude_service.call_text(
        ctx=ctx,
        model="claude-haiku-4-5-20251001",
        system="Reply with exactly the word: pong.",
        messages=[{"role": "user", "content": "ping"}],
        max_tokens=10,
        db=async_session,
    )

    # Be lenient — Claude might reply "Pong" or "pong." etc.
    assert "pong" in response.text.lower()
    assert response.tokens_input > 0
    assert response.tokens_output > 0

    rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is True
    assert rows[0].cost_usd > 0
