"""SQLAlchemy declarative base with a stable naming convention.

The naming convention ensures Alembic autogenerate produces deterministic
index, unique-constraint, check, foreign-key, and primary-key names.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Shared declarative base for all Grade-Sight ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
