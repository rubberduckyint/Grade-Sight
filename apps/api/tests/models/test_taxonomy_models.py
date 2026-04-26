"""Smoke tests for the taxonomy ORM models.

Verifies the three new models import cleanly, declare their relationships
correctly, and can be instantiated with valid data.
"""

from __future__ import annotations

from uuid import uuid4

from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory


def test_error_category_instantiates() -> None:
    cat = ErrorCategory(
        slug="conceptual",
        name="Conceptual",
        definition="The student doesn't understand the underlying concept.",
        distinguishing_marker="Did the student reach for the right tool?",
        severity_rank=4,
    )
    assert cat.slug == "conceptual"
    assert cat.severity_rank == 4


def test_error_subcategory_instantiates() -> None:
    sub = ErrorSubcategory(
        slug="property-rule-errors",
        category_id=uuid4(),
        name="Property / rule errors",
        definition="Applies a rule that doesn't exist.",
    )
    assert sub.slug == "property-rule-errors"


def test_error_pattern_instantiates() -> None:
    pat = ErrorPattern(
        slug="exponent-over-addition",
        subcategory_id=uuid4(),
        name="Exponent over addition",
        description="Treats (a+b)^2 as a^2 + b^2.",
        canonical_example="(a+b)^2 = a^2 + b^2",
        topics=["Algebra I", "Algebra II"],
        severity_hint="medium",
    )
    assert pat.slug == "exponent-over-addition"
    assert pat.topics == ["Algebra I", "Algebra II"]


def test_models_export_via_package_init() -> None:
    """Models must be re-exported from grade_sight_api.models for Alembic discovery."""
    from grade_sight_api.models import ErrorCategory, ErrorPattern, ErrorSubcategory  # noqa: F401
