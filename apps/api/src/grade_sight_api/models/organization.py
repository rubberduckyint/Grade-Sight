"""Organization model — top-level tenant. Nullable FK for parent-mode users."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TimestampMixin


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
