"""AnswerKey model — per-assignment reference data.

May be image-based (s3_url) or structured (content JSONB) or both.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class AnswerKey(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "answer_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    s3_url: Mapped[str | None] = mapped_column(nullable=True)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
