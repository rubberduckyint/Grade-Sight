"""User model — mirrors Clerk-authenticated users.

Role enum: parent, teacher, admin. clerk_id is the canonical external
identifier; email is stored for convenience but Clerk is authoritative.
"""

from __future__ import annotations

import enum
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from ..db.mixins import SoftDeleteMixin, TenantMixin, TimestampMixin


class UserRole(enum.StrEnum):
    parent = "parent"
    teacher = "teacher"
    admin = "admin"


class User(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    clerk_id: Mapped[str] = mapped_column(unique=True, nullable=False)
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"),
        nullable=False,
    )
    first_name: Mapped[str | None] = mapped_column(nullable=True)
    last_name: Mapped[str | None] = mapped_column(nullable=True)
