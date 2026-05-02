import asyncio
from unittest.mock import patch, MagicMock

import pytest

from grade_sight_api.services import stripe_service


@pytest.mark.asyncio
async def test_cancel_at_period_end_calls_stripe_modify_with_flag():
    with patch("grade_sight_api.services.stripe_service.stripe.Subscription.modify") as mock_modify:
        mock_modify.return_value = MagicMock()
        await stripe_service.cancel_at_period_end("sub_123")
    mock_modify.assert_called_once_with("sub_123", cancel_at_period_end=True)
