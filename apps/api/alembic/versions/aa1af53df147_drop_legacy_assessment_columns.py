"""drop legacy assessment columns

Revision ID: aa1af53df147
Revises: 7015f412ba44
Create Date: 2026-04-27 07:40:18.868899

"""
from typing import Sequence, Union

from alembic import op


revision: str = "aa1af53df147"
down_revision: Union[str, Sequence[str], None] = "7015f412ba44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("assessments", "s3_url")
    op.drop_column("assessments", "original_filename")


def downgrade() -> None:
    import sqlalchemy as sa

    op.add_column(
        "assessments",
        sa.Column("s3_url", sa.String(), nullable=True),
    )
    op.add_column(
        "assessments",
        sa.Column("original_filename", sa.String(), nullable=True),
    )
