"""LLMCallLog — append-only record of every Claude (or other LLM) call.

Written by the service layer (Spec 4). Powers cost dashboards and the
observability story around model usage.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import TenantMixin


class LLMCallLog(Base, TenantMixin):
    __tablename__ = "llm_call_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    model: Mapped[str] = mapped_column(nullable=False)
    tokens_input: Mapped[int] = mapped_column(nullable=False)
    tokens_output: Mapped[int] = mapped_column(nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    latency_ms: Mapped[int] = mapped_column(nullable=False)
    request_type: Mapped[str] = mapped_column(nullable=False)
    success: Mapped[bool] = mapped_column(nullable=False)
    error_message: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
