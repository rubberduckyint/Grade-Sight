# Taxonomy Schema + Seeding — Design

**Spec 8 of Phase 1 MVP**
**Date:** 2026-04-25
**Status:** approved (design)
**Consumes:** `docs/superpowers/specs/2026-04-25-error-taxonomy-v1.md`

## Goal

Build the database tables that hold the cognitive error taxonomy from the v1 doc, and a seed script that loads the taxonomy into the database. After this spec ships, the diagnostic engine spec can query the taxonomy via SQLAlchemy at runtime instead of hardcoding it in prompts.

This spec is the bridge between "the taxonomy as a markdown doc" and "the taxonomy as data the diagnostic engine consumes."

## Scope

**In scope:**
- Three new SQLAlchemy models: `ErrorCategory`, `ErrorSubcategory`, `ErrorPattern`.
- One Alembic migration creating all three tables together.
- One seed script (`apps/api/scripts/seed_taxonomy.py`) with the v1 taxonomy as a Python literal source-of-truth.
- One `pnpm db:seed` script entry wrapping the seed invocation.
- Five unit tests covering the seed function (clean run, idempotency, in-place update, validation failures).

**Out of scope (deferred):**
- Intervention library tables (separate spec).
- Diagnostic record / per-error-instance tables (separate spec — the diagnostic engine will need them).
- Per-org taxonomy customization (post-MVP; the v1 taxonomy is shared across all orgs).
- A YAML/JSON external file format for the taxonomy (revisit when non-engineers contribute edits).
- CI check that the Python literal matches the markdown doc (overkill for v1; we maintain alignment manually).

## Architectural choices (with rationale)

### Three tables, not one

Three separate tables (categories, subcategories, patterns) instead of a single self-referential parent_id table. The taxonomy is fixed-depth (always 3 levels), and each level has different metadata:
- Categories carry `severity_rank` for tie-breaking.
- Subcategories are pure structure.
- Patterns carry `topics`, `severity_hint`, `canonical_example`, soft-delete.

A single self-referential table would force every level to share a column shape. Three tables match the actual structure.

### Shared across tenants (no `TenantMixin`)

There's one canonical Grade-Sight taxonomy. Different orgs see the same categories. No `organization_id` column on any of the three tables. If a future district wants their own labels, that's a post-MVP override pattern, not a different shared table.

### Soft delete on patterns only

Per the v1 taxonomy doc, leaf patterns are append-only at the structural level. To retire a leaf without breaking historical diagnostic records, mark it with a `deleted_at` timestamp (via the existing `SoftDeleteMixin`) and stop suggesting it for new diagnoses.

Categories and sub-categories are stable structure — they don't deprecate. They use `TimestampMixin` only.

### Python literal source-of-truth, separate seed script

- **Python literal** for seed data (vs YAML or parsed markdown): no new file format, version-controlled with the code, easy to review in a PR. ~300 lines of structured Python. Revisit when non-engineers start contributing edits.
- **Separate seed script** (vs Alembic data migration or boot-time auto-seed): explicit two-step bootstrap (`pnpm db:migrate && pnpm db:seed`) matches every other piece of infra in this project. Re-running after taxonomy edits is safe and idempotent.

### Additive-only seeding

The seed UPSERTs by slug. Removing a row from the Python file does NOT delete it from the database. Deprecation happens via the row's `deleted_at` column, set manually (or via a future deprecation API), not by absence in the seed file.

This prevents accidental data loss if a leaf is mis-edited or temporarily commented out.

## Components

### `apps/api/src/grade_sight_api/models/error_category.py` (new)

```python
class ErrorCategory(Base, TimestampMixin):
    __tablename__ = "error_categories"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    distinguishing_marker: Mapped[str] = mapped_column(Text, nullable=False)
    severity_rank: Mapped[int] = mapped_column(nullable=False)

    subcategories: Mapped[list["ErrorSubcategory"]] = relationship(back_populates="category")
```

`severity_rank` mirrors the tie-breaker order from the taxonomy doc (1=Verification lightest, 4=Conceptual heaviest). Stored as data so the diagnostic engine consumes it without hardcoding.

### `apps/api/src/grade_sight_api/models/error_subcategory.py` (new)

```python
class ErrorSubcategory(Base, TimestampMixin):
    __tablename__ = "error_subcategories"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("error_categories.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)

    category: Mapped["ErrorCategory"] = relationship(back_populates="subcategories")
    patterns: Mapped[list["ErrorPattern"]] = relationship(back_populates="subcategory")
```

Slug is globally unique (not just within parent) — easier lookup, no composite-key complications later.

### `apps/api/src/grade_sight_api/models/error_pattern.py` (new)

```python
class ErrorPattern(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "error_patterns"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    subcategory_id: Mapped[UUID] = mapped_column(
        ForeignKey("error_subcategories.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_example: Mapped[str] = mapped_column(Text, nullable=False)
    topics: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'::text[]"),
    )
    severity_hint: Mapped[str] = mapped_column(nullable=False)

    subcategory: Mapped["ErrorSubcategory"] = relationship(back_populates="patterns")
```

`topics` uses Postgres native `ARRAY(String)` since we're Postgres-only. `severity_hint` is `light` | `medium` | `heavy` and lets a leaf override the parent category's default rank in edge cases (e.g., a relatively light Conceptual leaf).

### Alembic migration

Auto-generated via `uv run alembic revision --autogenerate -m "add error taxonomy tables"`. Creates the three tables with their indexes, foreign keys, and unique constraints in one revision. No data inserted at migration time.

### `apps/api/scripts/__init__.py` and `apps/api/scripts/seed_taxonomy.py` (new)

The script structure:

```python
# apps/api/scripts/seed_taxonomy.py
"""Idempotent seeder for the cognitive error taxonomy.

Run via: pnpm db:seed (or uv run python -m grade_sight_api.scripts.seed_taxonomy)

Source of truth for the v1 taxonomy. The markdown doc at
docs/superpowers/specs/2026-04-25-error-taxonomy-v1.md is the human-readable
mirror; this file is what the database actually loads.
"""

CATEGORIES: list[dict[str, Any]] = [
    {
        "slug": "verification",
        "name": "Verification",
        "definition": "...",
        "distinguishing_marker": "...",
        "severity_rank": 1,
    },
    {"slug": "execution", ..., "severity_rank": 2},
    {"slug": "strategy", ..., "severity_rank": 3},
    {"slug": "conceptual", ..., "severity_rank": 4},
]

SUBCATEGORIES: list[dict[str, Any]] = [
    {
        "slug": "definition-errors",
        "category": "conceptual",
        "name": "Definition errors",
        "definition": "...",
    },
    # ... 13 more
]

PATTERNS: list[dict[str, Any]] = [
    {
        "slug": "exponent-over-addition",
        "subcategory": "property-rule-errors",
        "name": "...",
        "description": "...",
        "canonical_example": "(a+b)² = a² + b²",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "medium",
    },
    # ... ~40 patterns
]
```

Plus a main `async def seed(db: AsyncSession) -> SeedReport` function that:
1. Validates the in-file data (see Error Handling).
2. UPSERTs categories by slug.
3. UPSERTs subcategories by slug, resolving parent `category_id` from the just-upserted categories.
4. UPSERTs patterns by slug, resolving parent `subcategory_id` similarly.
5. Returns a `SeedReport` dataclass: counts of created vs updated for each table.

Plus a top-level `if __name__ == "__main__":` that runs `seed()` against the live DB session and prints the report.

### `package.json` updates

Root `package.json`:
```json
"db:seed": "pnpm --filter api db:seed"
```

`apps/api/package.json`:
```json
"db:seed": "uv run python -m grade_sight_api.scripts.seed_taxonomy"
```

## Data flow

```
Bootstrap a new env:
   pnpm db:migrate         → Alembic creates 3 taxonomy tables
   pnpm db:seed            → seed_taxonomy.py loads v1 data

Edit the taxonomy:
   1. Update the Python literal in seed_taxonomy.py
   2. Re-run pnpm db:seed
   3. The diagnostic engine sees the changes on next query (no app restart needed)

Retire a leaf pattern:
   1. Either mark deleted_at on the row directly via SQL,
      or call a future API once we build a taxonomy-management surface
   2. The diagnostic engine filters by deleted_at IS NULL on classification queries
   3. Historical diagnostic records still reference the row by id and remain valid

Diagnostic engine queries (future spec):
   await db.execute(
       select(ErrorCategory).options(
           selectinload(ErrorCategory.subcategories)
              .selectinload(ErrorSubcategory.patterns)
       )
   )
   → returns the full tree, ready for prompt-context construction
```

## Error handling

### Validation (before any DB writes)

The seed script validates the Python literal data before any UPSERT:

1. All category `slug`s unique within `CATEGORIES`.
2. `severity_rank` values in `CATEGORIES` form the complete set `{1, 2, 3, 4}` (no missing or duplicate ranks).
3. All subcategory `slug`s unique within `SUBCATEGORIES`.
4. Each subcategory's `category` slug must reference a defined category in `CATEGORIES`.
5. All pattern `slug`s unique within `PATTERNS`.
6. Each pattern's `subcategory` slug must reference a defined subcategory in `SUBCATEGORIES`.
7. `severity_hint` ∈ {`light`, `medium`, `heavy`}.
8. `topics` is a non-empty list (every pattern is tagged with at least one topic).

Any validation failure raises `ValueError` with an actionable message naming the offending row, before any DB write happens. The script exits with code 1.

### Database write failures

asyncpg / SQLAlchemy errors propagate. The script's outer try/except logs the error and exits non-zero. Partial writes are rolled back via the implicit transaction around the seed function (entire seed is one atomic transaction).

## Testing

Five unit tests in `apps/api/tests/seed/test_taxonomy_seed.py` (new directory):

1. **`test_seed_runs_clean_on_empty_db`** — runs `seed()` against an empty `async_session`; asserts 4 categories, 14 subcategories, ~40 patterns inserted; spot-checks one row from each level (e.g., the `conceptual` category, the `property-rule-errors` subcategory, the `exponent-over-addition` pattern).
2. **`test_seed_is_idempotent`** — runs `seed()` twice; asserts row counts unchanged after the second run; asserts no row was duplicated.
3. **`test_seed_updates_in_place_when_data_changes`** — seeds, mutates a description directly in the in-memory `CATEGORIES` list (or via monkeypatch), reseeds, asserts the row's description was updated and no new row was created.
4. **`test_seed_validates_orphan_subcategory`** — calls the validator with `SUBCATEGORIES = [{slug: "x", category: "doesnt-exist", ...}]`; asserts `ValueError` with message naming `"x"` and `"doesnt-exist"`; asserts zero rows written.
5. **`test_seed_validates_severity_rank_completeness`** — calls the validator with category ranks `{1, 2, 2, 4}` (missing 3); asserts `ValueError`; asserts zero rows written.

All tests use the existing `async_session` fixture from `conftest.py` (function-scoped SAVEPOINT rollback). No integration / smoke test — the seed runs against a real local DB during development; CI runs the unit tests.

## Out of this spec, queued for later

- **Intervention library v1 spec** — `interventions` table + content tagged to leaf patterns. Depends on this spec.
- **Diagnostic engine spec** — Claude prompt design that queries this taxonomy at runtime via prompt caching. Depends on this spec + the assessment upload spec.
- **Per-org taxonomy customization** — post-MVP. Override pattern, not a different shared table.
- **CI alignment check** — automated verification that the Python literal matches the markdown doc. Manual alignment for v1.
- **Taxonomy management API / admin UI** — for non-engineer edits. Currently engineer-edits-Python-then-reseed.
- **YAML/JSON external file format** — when non-engineers (pedagogy advisors, teachers) start contributing edits. Currently engineer-only.
