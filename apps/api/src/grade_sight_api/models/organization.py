"""Organization model — top-level tenant. Nullable FK for parent-mode users."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin
from .subscription import SubscriptionStatus


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
    clerk_org_id: Mapped[str | None] = mapped_column(
        unique=True,
        nullable=True,
    )
    # Denormalized from subscriptions.status for fast entitlement reads.
    # Maintained by webhook handlers and the extended lazy upsert.
    subscription_status: Mapped[SubscriptionStatus | None] = mapped_column(
        SAEnum(SubscriptionStatus, name="subscription_status"),
        nullable=True,
    )
