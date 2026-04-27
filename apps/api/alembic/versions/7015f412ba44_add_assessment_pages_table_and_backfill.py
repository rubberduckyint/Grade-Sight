"""add assessment_pages table and backfill

Revision ID: 7015f412ba44
Revises: 03d875d9c97a
Create Date: 2026-04-27 07:12:40.641136

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7015f412ba44"
down_revision: Union[str, Sequence[str], None] = "03d875d9c97a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BACKFILL_SQL = """
INSERT INTO assessment_pages (
    id, assessment_id, page_number, s3_url, original_filename,
    content_type, organization_id, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    id,
    1,
    s3_url,
    original_filename,
    'image/png',
    organization_id,
    now(),
    now()
FROM assessments
WHERE s3_url IS NOT NULL AND deleted_at IS NULL;
"""


def upgrade() -> None:
    op.create_table(
        "assessment_pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("s3_url", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["assessment_id"],
            ["assessments.id"],
            name=op.f("fk_assessment_pages_assessment_id_assessments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_assessment_pages_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assessment_pages")),
        sa.UniqueConstraint(
            "assessment_id",
            "page_number",
            name="uq_assessment_pages_assessment_id_page_number",
        ),
    )
    op.create_index(
        "ix_assessment_pages_assessment_id",
        "assessment_pages",
        ["assessment_id"],
        unique=False,
    )
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.drop_index(
        "ix_assessment_pages_assessment_id",
        table_name="assessment_pages",
    )
    op.drop_table("assessment_pages")
