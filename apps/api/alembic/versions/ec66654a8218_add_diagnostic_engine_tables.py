"""add diagnostic engine tables

Revision ID: ec66654a8218
Revises: aa1af53df147
Create Date: 2026-04-27 11:18:47.473371

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ec66654a8218"
down_revision: Union[str, Sequence[str], None] = "aa1af53df147"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assessment_diagnoses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("prompt_version", sa.String(), nullable=False),
        sa.Column("tokens_input", sa.Integer(), nullable=False),
        sa.Column("tokens_output", sa.Integer(), nullable=False),
        sa.Column("tokens_cache_read", sa.Integer(), nullable=True),
        sa.Column("tokens_cache_creation", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("overall_summary", sa.Text(), nullable=True),
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
            name=op.f("fk_assessment_diagnoses_assessment_id_assessments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_assessment_diagnoses_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assessment_diagnoses")),
        sa.UniqueConstraint(
            "assessment_id",
            name=op.f("uq_assessment_diagnoses_assessment_id"),
        ),
    )
    op.create_table(
        "problem_observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("diagnosis_id", sa.Uuid(), nullable=False),
        sa.Column("problem_number", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("student_answer", sa.Text(), nullable=False),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("error_pattern_id", sa.Uuid(), nullable=True),
        sa.Column("error_description", sa.Text(), nullable=True),
        sa.Column("solution_steps", sa.Text(), nullable=True),
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
            ["diagnosis_id"],
            ["assessment_diagnoses.id"],
            name=op.f("fk_problem_observations_diagnosis_id_assessment_diagnoses"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["error_pattern_id"],
            ["error_patterns.id"],
            name=op.f("fk_problem_observations_error_pattern_id_error_patterns"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_problem_observations_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_problem_observations")),
        sa.UniqueConstraint(
            "diagnosis_id",
            "problem_number",
            name="uq_problem_observations_diagnosis_id_problem_number",
        ),
    )
    op.create_index(
        "ix_problem_observations_diagnosis_id",
        "problem_observations",
        ["diagnosis_id"],
        unique=False,
    )
    op.create_index(
        "ix_problem_observations_error_pattern_id",
        "problem_observations",
        ["error_pattern_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_problem_observations_error_pattern_id",
        table_name="problem_observations",
    )
    op.drop_index(
        "ix_problem_observations_diagnosis_id",
        table_name="problem_observations",
    )
    op.drop_table("problem_observations")
    op.drop_table("assessment_diagnoses")
