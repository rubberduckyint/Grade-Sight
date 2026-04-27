"""add answer key pages and engine modes

Revision ID: 45ec09b0d696
Revises: ec66654a8218
Create Date: 2026-04-27 16:54:24.414952

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "45ec09b0d696"
down_revision: Union[str, Sequence[str], None] = "ec66654a8218"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create answer_key_pages table
    op.create_table(
        "answer_key_pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("answer_key_id", sa.Uuid(), nullable=False),
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
            ["answer_key_id"],
            ["answer_keys.id"],
            name=op.f("fk_answer_key_pages_answer_key_id_answer_keys"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_answer_key_pages_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_answer_key_pages")),
        sa.UniqueConstraint(
            "answer_key_id",
            "page_number",
            name="uq_answer_key_pages_answer_key_id_page_number",
        ),
    )
    op.create_index(
        "ix_answer_key_pages_answer_key_id",
        "answer_key_pages",
        ["answer_key_id"],
        unique=False,
    )

    # Drop legacy AnswerKey columns
    op.drop_column("answer_keys", "s3_url")
    op.drop_column("answer_keys", "content")

    # Add Assessment columns
    op.add_column(
        "assessments",
        sa.Column(
            "already_graded",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "assessments",
        sa.Column(
            "review_all",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Add AssessmentDiagnosis columns
    op.add_column(
        "assessment_diagnoses",
        sa.Column("total_problems_seen", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assessment_diagnoses",
        sa.Column(
            "analysis_mode",
            sa.String(),
            nullable=False,
            server_default=sa.text("'auto_grade'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("assessment_diagnoses", "analysis_mode")
    op.drop_column("assessment_diagnoses", "total_problems_seen")
    op.drop_column("assessments", "review_all")
    op.drop_column("assessments", "already_graded")
    op.add_column(
        "answer_keys",
        sa.Column("content", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "answer_keys",
        sa.Column("s3_url", sa.String(), nullable=True),
    )
    op.drop_index(
        "ix_answer_key_pages_answer_key_id",
        table_name="answer_key_pages",
    )
    op.drop_table("answer_key_pages")
