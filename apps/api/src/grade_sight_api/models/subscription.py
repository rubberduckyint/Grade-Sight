"""Subscription model — one per organization, Stripe-backed.

stripe_subscription_id is NULL during the no-card trial phase (we track
trial_ends_at locally); it's populated once the user adds a card via
Stripe Checkout.
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin


class Plan(enum.StrEnum):
    parent_monthly = "parent_monthly"
    teacher_monthly = "teacher_monthly"


class SubscriptionStatus(enum.StrEnum):
    trialing = "trialing"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
    incomplete = "incomplete"


class Subscription(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (
        Index(
            "uq_subscriptions_stripe_subscription_id",
            "stripe_subscription_id",
            unique=True,
            postgresql_where=text("stripe_subscription_id IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    stripe_customer_id: Mapped[str] = mapped_column(nullable=False, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(nullable=True)
    plan: Mapped[Plan] = mapped_column(SAEnum(Plan, name="plan"), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(SubscriptionStatus, name="subscription_status"),
        nullable=False,
        index=True,
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(nullable=True, index=True)
    current_period_end: Mapped[datetime | None] = mapped_column(nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        nullable=False,
        server_default=text("false"),
    )
