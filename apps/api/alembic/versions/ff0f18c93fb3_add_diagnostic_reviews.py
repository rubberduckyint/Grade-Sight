"""add diagnostic reviews

Revision ID: ff0f18c93fb3
Revises: 19af2d227f34
Create Date: 2026-04-30 08:25:57.175004

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ff0f18c93fb3"
down_revision: Union[str, Sequence[str], None] = "19af2d227f34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "diagnostic_reviews",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "assessment_id",
            sa.Uuid(),
            sa.ForeignKey("assessments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("problem_number", sa.Integer(), nullable=False),
        sa.Column(
            "original_pattern_id",
            sa.Uuid(),
            sa.ForeignKey("error_patterns.id"),
            nullable=True,
        ),
        sa.Column(
            "override_pattern_id",
            sa.Uuid(),
            sa.ForeignKey("error_patterns.id"),
            nullable=True,
        ),
        sa.Column(
            "marked_correct",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "reviewed_by",
            sa.Uuid(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "reviewed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_diagnostic_reviews_assessment_id",
        "diagnostic_reviews",
        ["assessment_id"],
        unique=False,
    )
    op.create_index(
        "ix_diagnostic_reviews_active_unique",
        "diagnostic_reviews",
        ["assessment_id", "problem_number"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_diagnostic_reviews_active_unique",
        table_name="diagnostic_reviews",
    )
    op.drop_index(
        "ix_diagnostic_reviews_assessment_id",
        table_name="diagnostic_reviews",
    )
    op.drop_table("diagnostic_reviews")
