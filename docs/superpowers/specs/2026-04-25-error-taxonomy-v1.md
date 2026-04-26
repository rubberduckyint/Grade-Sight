# Grade-Sight Error Taxonomy v1

**Date:** 2026-04-25
**Status:** v1 (educated draft for MVP)
**Domain:** Secondary math, Algebra I → Pre-Calculus, US K-12 standards

## Purpose

Defines the four-category error taxonomy that Grade-Sight uses to classify *why* a student lost points on a graded assessment. The taxonomy is the cognitive layer of the diagnostic engine — what kind of mistake the student made, regardless of which math topic the problem was about.

The taxonomy is **standards-agnostic**. It applies whether a student is doing CA Common Core, TX TEKS, NY Regents, or any other US secondary math curriculum. Math *topics* (factoring, trig identities, etc.) vary by state and grade and are tracked separately as metadata on leaf patterns; the cognitive categories themselves do not.

The taxonomy is **data, not code**: it lives in the database (`error_categories` and `error_patterns` tables, gated for build until this doc is approved), is loaded at runtime, and is referenced by Claude prompts via prompt-cached context. It is intended to be refined and expanded after launch without code changes.

## Scope of v1

**In scope:**
- The four top-level cognitive categories.
- Two levels of sub-categorization underneath each (sub-category, then leaf pattern).
- Distinguishing markers (how to tell one category from a neighbor).
- A decision flowchart for ambiguous cases.
- A tie-breaker rule.
- Confidence-scoring guidance.
- Example leaf patterns for the most common error types.

**Out of scope (deferred):**
- Exhaustive leaf-pattern enumeration. Leaves are extensible and grow with curriculum + teacher feedback.
- Topic-specific pattern banks for advanced courses (Calculus, Statistics) — out of MVP curriculum.
- Pedagogy-anchored research citations (Newman's Error Analysis, NCTM Process Standards, etc.) — see Post-Launch Roadmap.
- Intervention library (separate spec).
- DB schema and seed script (separate spec; consumes this doc).

## Structure

The taxonomy has three levels:

```
Category (4, fixed)
└── Sub-category (3-4 per category, mostly fixed)
    └── Leaf pattern (extensible, topic-tagged)
```

The top two levels (category + sub-category) are **cognitive** and stable across topics, courses, and states. They will not change frequently.

The leaf-pattern level is **extensible**: leaves grow as we encounter new error types. Each leaf carries metadata for which math topic(s) it appears in (e.g., "Algebra I", "Trigonometry"), which standards it maps to, and a canonical example.

### Database shape (preview, for the schema spec)

```
error_categories:
  - id (UUID)
  - slug (str, unique)         e.g. "conceptual"
  - name (str)                 e.g. "Conceptual"
  - definition (text)
  - distinguishing_marker (text)

error_subcategories:
  - id, slug, parent_category_id, name, definition

error_patterns:    (the "leaf patterns")
  - id, slug, parent_subcategory_id
  - name, description
  - canonical_example (text)
  - topics (array of topic tags)
  - severity (light|medium|heavy — see Tie-Breaker)
  - common_intervention_types (array)
```

---

## Category 1: Conceptual

**Definition.** The student got it wrong because they don't understand the underlying mathematical concept, rule, or relationship. They wouldn't get it right even with infinite time and care — the gap is in *what they know*, not *what they did*.

**Distinguishing marker (vs Execution):** *Did the student reach for the right tool, or the wrong tool?* If they used a known-correct rule and slipped while applying it → Execution. If they applied a non-existent rule, used the wrong concept entirely, or didn't know the relevant concept exists → Conceptual.

### Sub-categories

**1.1 Definition errors.** Misunderstands what a term, symbol, or notation means.
- *Examples:* reads `f(x)` as multiplication; thinks "factor" and "expand" are synonyms; confuses ≤ with <; misreads what `∑` represents.

**1.2 Property / rule errors.** Applies a rule that doesn't exist, or misapplies a foundational property. The classic "freshman's dream" lives here.
- *Examples:* `(a+b)² = a² + b²`; `√(a²+b²) = a+b`; `log(a+b) = log a + log b`; `(a/b)/(c/d) = (a·c)/(b·d)`.

**1.3 Relational errors.** Doesn't connect related concepts. Treats two representations of the same idea as unrelated.
- *Examples:* can solve `2x + 4 = 10` algebraically but can't read it off a graph; doesn't recognize that slope and rate-of-change are the same idea; doesn't see that a system of equations is equivalent to two graphs intersecting.

**1.4 Domain / applicability errors.** Doesn't recognize when a concept applies (or doesn't).
- *Examples:* uses Pythagorean theorem on a non-right triangle; takes the square root of both sides without considering ±; treats a piecewise function as continuous; applies SOH-CAH-TOA outside a right triangle.

### Example leaf patterns (v1 seed)

- `conceptual > property > exponent-over-addition` — `(a+b)² = a² + b²`. Topic: Algebra I, Algebra II.
- `conceptual > property > radical-over-addition` — `√(a²+b²) = a+b`. Topic: Algebra I, Algebra II.
- `conceptual > property > log-of-sum` — `log(a+b) = log a + log b`. Topic: Algebra II, Pre-Calc.
- `conceptual > definition > slope-vs-y-intercept` — confuses `m` and `b` in `y = mx + b`. Topic: Algebra I.
- `conceptual > definition > function-notation-as-multiplication` — reads `f(x)` as `f × x`. Topic: Algebra I, Algebra II.
- `conceptual > domain > pythagorean-on-non-right` — applies `a²+b²=c²` to a triangle without confirming it has a right angle. Topic: Geometry.
- `conceptual > domain > sqrt-without-plus-minus` — `x² = 9` → `x = 3` only (misses `x = -3`). Topic: Algebra I.
- `conceptual > relational > graph-equation-disconnect` — can't recognize the same line in algebraic and graphical form. Topic: Algebra I.

---

## Category 2: Execution

**Definition.** The student knows what to do — they reach for the right tool — but slips up while using it. The gap is in *the doing*, not *the knowing*. With more care, slower work, or a calculator check, they'd often catch it themselves.

**Distinguishing markers:**
- *vs Conceptual:* the student reached for the right tool. The work shows the right approach was attempted.
- *vs Verification:* the slip is *upstream* of the answer; verification errors happen *after* a candidate answer exists.

### Sub-categories

**2.1 Arithmetic.** Slips in basic computation: addition, subtraction, multiplication, division, sign tracking.
- *Examples:* `7 × 8 = 54`; drops a negative sign mid-line; subtracts when meant to add.

**2.2 Algebraic manipulation.** Slips in symbolic rule application: distribution, combining like terms, moving terms across `=`, factoring.
- *Examples:* `-3(x − 2) = -3x − 6` (forgot to flip the sign on the second term); `2x + 3x = 6x` (multiplied instead of added); `√(x²) = x` without absolute value.

**2.3 Procedural / multi-step.** Skips a step in a known procedure, applies steps out of order, or gives up midway. Visible as a "jump" in the work where intermediate work is missing or wrong.
- *Examples:* quadratic formula but forgets to divide by `2a`; long division but forgets to bring down a digit; partial fractions skipping a coefficient; forgot the `±` on a discriminant.

**2.4 Notation / transcription.** Knows the math, mis-writes it. The error is in the *recording*, not the *reasoning*.
- *Examples:* copies `7` as `1` from line to line; writes `=` where `≈` was meant; mis-aligns columns when adding fractions; transposes digits when carrying.

### Example leaf patterns (v1 seed)

- `execution > arithmetic > sign-flip-on-distribution` — distributes `-3(x − 2)` and gets `-3x − 6`. Topic: all algebra-and-up.
- `execution > arithmetic > times-tables-slip` — `7 × 8 = 54`. Topic: all.
- `execution > arithmetic > sign-drop` — drops a negative sign mid-equation. Topic: all algebra-and-up.
- `execution > algebraic > combine-unlike-terms` — `2x + 3y = 5xy`. Topic: Algebra I.
- `execution > algebraic > sqrt-without-absolute-value` — `√(x²) = x`. Topic: Algebra II, Pre-Calc.
- `execution > procedural > quadratic-formula-step-skip` — forgets `÷ 2a`, or `±`. Topic: Algebra I, Algebra II.
- `execution > procedural > foil-incomplete` — distributes only first × first and last × last, misses cross terms. Topic: Algebra I.
- `execution > notation > digit-transcription` — `7` becomes `1` between lines. Topic: all.

---

## Category 3: Verification

**Definition.** The student arrived at *an* answer (correct-shaped or not) but failed in the **post-answer check**. They didn't validate, didn't sanity-check, didn't reason about whether their result was reasonable. The visible math may be correct; the failure is in the absent self-review.

This category is what makes Grade-Sight different from "did you get the right answer?" graders. Many students miss points not because they couldn't solve, but because they didn't check.

**Distinguishing marker:** *Walk the visible math steps. Are they all correct, but the final answer is wrong anyway?* That's Verification. (If a step is wrong, route to Execution or Conceptual instead.)

### Sub-categories

**3.1 No-check errors.** Student didn't verify at all when they should have. The work *looks* finished but skips an obvious validation step.
- *Examples:* solves `√(x+3) = -2` and writes `x = 1` without checking that it doesn't actually satisfy the equation; finds roots of a quadratic and never substitutes back; computes a probability greater than 1 and doesn't notice.

**3.2 Reasonableness / sanity errors.** Student didn't ask "does this answer make sense in context?"
- *Examples:* word problem about "how many students," answer is `7.4`; geometry problem, length comes out negative; word problem says "less than 100," answer is `350`.

**3.3 Domain-checking errors.** Student didn't check that their answer lies in the valid domain. Distinct from *Conceptual domain errors*: here the student knew domains existed but forgot to check; in Conceptual they didn't know the concept of domain applied.
- *Examples:* solves an algebraic equation, gets two roots, doesn't notice one makes a denominator zero; quadratic in `x` for a real-world distance, accepts a complex root.

**3.4 Unit / dimensional errors.** Student didn't check that units match across the problem. (Sparsely populated for v1 — populated only for highest-frequency cases.)
- *Examples:* adds meters and feet without converting; reports area in linear units; degrees vs radians mode mismatch.

### Example leaf patterns (v1 seed)

- `verification > no-check > extraneous-root-not-rejected` — keeps both roots after squaring step. Topic: Algebra II.
- `verification > no-check > root-not-substituted-back` — solves a quadratic, never plugs in to verify. Topic: Algebra I, Algebra II.
- `verification > reasonableness > non-integer-count` — "7.4 students." Topic: word problems across all.
- `verification > reasonableness > negative-magnitude` — negative length / area / time. Topic: Geometry, word problems.
- `verification > reasonableness > magnitude-impossible` — answer wildly larger or smaller than context allows. Topic: word problems across all.
- `verification > domain-check > division-by-zero-uncaught` — solution makes a denominator vanish. Topic: Algebra II.
- `verification > units > degrees-radians-mismatch` — Pre-Calc / Trig calculator-mode error. Topic: Pre-Calc, Trig.
- `verification > units > linear-vs-square` — reports area in cm instead of cm². Topic: Geometry.

---

## Category 4: Strategy

**Definition.** The student got it wrong because of *how they approached the problem* — not because they didn't know the math (Conceptual), didn't compute carefully (Execution), or didn't sanity-check (Verification). The error is in *strategy*: which path they chose to attack the problem.

**Note on the original "Confidence/Strategy" name:** the framing originally bundled confidence into this category. In v1 we drop "confidence" from the category name because confidence is an *inferred state* (visible only in cross-assessment patterns: "this student skips word problems but tackles symbolic ones"), not a per-error type. Confidence patterns surface at the *longitudinal* level — see Pattern-Level Overrides below — and live in pattern-detection, not per-error classification.

**Distinguishing markers:**
- *vs Conceptual:* the student isn't missing knowledge — they have the tools but chose poorly which to apply. If they didn't *know* the right approach, that's Conceptual. If they knew but chose differently, that's Strategy.
- *vs Execution:* Execution is a slip *during* a chosen approach. Strategy is about the choice of approach itself.
- *vs Verification:* Verification is "did they check?" Strategy is "did they pick the right path?" — upstream of the answer.

### Sub-categories

**4.1 Wrong strategy / inefficient attack.** Student picks a path that *can* work but is needlessly complex, or that's wrong for this problem class. The math along the way may be correct; the *choice of approach* led them off course.
- *Examples:* uses substitution when elimination is dramatically faster; sets up a coordinate proof when an algebraic argument is intended; tries to factor a quadratic that doesn't factor and runs out of time.

**4.2 Incomplete attempt.** Student gives up partway through. Visible as work that started reasonable but stops mid-problem.
- *Examples:* sets up the equation correctly but doesn't solve; writes "I don't know" after starting; cuts work short on a multi-part question.

**4.3 No attempt.** Student leaves the problem completely blank. No work shown at all.
- *Special handling:* this leaf bypasses the full taxonomy walk. The diagnostic value is in the *pattern across the assessment* (which problems do they skip?) rather than per-problem fix.

**4.4 Over-reliance on memorized procedure.** Student applies a procedure from rote memory that doesn't fit. Often shows as "right-looking" steps that don't connect to the problem actually being asked.
- *Examples:* applies the quadratic formula to a linear equation; uses the slope formula on a problem that doesn't need it; rote-applies a rule ("when in doubt, FOIL") to a problem that doesn't call for it.

### Example leaf patterns (v1 seed)

- `strategy > wrong-strategy > brute-force-unsystematic` — guess-and-check on a solvable equation. Topic: Algebra I.
- `strategy > wrong-strategy > substitution-when-elimination-wins` — picks the harder approach for a system. Topic: Algebra I, Algebra II.
- `strategy > incomplete > stopped-midway` — set up correctly, abandoned. Topic: all.
- `strategy > no-attempt > skip` — left blank. Topic: all (special handling).
- `strategy > over-procedure > misapplied-formula` — rote formula on the wrong problem class. Topic: all.

---

## Decision rules for ambiguous cases

The four categories are clean in textbook examples but real student work is messy. Claude needs an explicit decision procedure to apply consistently.

### The classification flowchart

For each wrong answer, walk these steps in order:

1. **Is the answer correct?**
   → YES: no error to classify; skip this problem.
   → NO: continue.

2. **Is there NO work shown** (totally blank, or just an answer with no steps)?
   → YES: classify as `strategy > no-attempt > skip`. Stop.
   → NO: continue.

3. **Walk the work step by step. Find the first wrong step (or note that no step is wrong).**

4. **If no step is wrong AND the answer is still wrong** (extraneous root kept, impossible magnitude, unit mismatch, etc.):
   → **Verification**. Identify the specific check that was missed. Stop.

5. **If a step IS wrong, ask: was the *tool* the student reached for the right tool for this problem class?**
   - **YES (right tool, slipped while using it):** → **Execution**.
   - **NO, but the student had the right tool available** (visible from earlier problems on the same assessment, or expected by curriculum at this level): → **Strategy**.
   - **NO, and the student doesn't appear to know the right tool exists at all** (applies a non-existent rule, misuses notation, doesn't recognize the problem class): → **Conceptual**.

### Tie-breaker (when two categories genuinely both fit)

Default to the **lighter diagnosis**. The categories ordered by diagnostic severity (lightest to heaviest):

```
Verification → Execution → Strategy → Conceptual
   (lighter)                          (heavier)
```

Why: misdiagnosing a slip as a knowledge gap tells a parent "your kid doesn't understand fractions" when actually they made one arithmetic mistake. That's harmful framing. The product errs toward the charitable read at the per-error level. **Real gaps surface via the pattern-level analysis below**, not via aggressive per-error classification.

Specific tie-breakers:
- Ambiguous **Execution vs. Conceptual** → prefer **Execution**.
- Ambiguous **Strategy vs. Conceptual** → prefer **Strategy**.
- Ambiguous **Verification vs. Execution** → if all visible steps are correct, prefer Verification; otherwise Execution.

### Compound errors

Real student work often has cascading mistakes — a sign error in step 2 propagates through steps 3-5.

- Classify by the **first** visible error (the upstream cause).
- Document the cascade in the diagnostic's `specific_description` field but don't multi-classify.
- This avoids inflated error counts and keeps interventions targeted at the root cause.

### Pattern-level overrides

Per-error classification is conservative (charitable). But the engine also looks across the assessment (and longitudinally across many assessments) for repeated structure.

**Rule:** If pattern detection finds N+ errors with the same shape on the same concept, the *pattern* is upgraded to a heavier category even if each individual error stayed lighter. Specifically:
- 3+ Execution errors on the same concept (e.g., 3 sign errors when distributing) → pattern flagged as **Conceptual** at the longitudinal level. Per-error classifications stay as Execution; the pattern is what tells the parent/teacher "this isn't a slip, it's a gap."
- 3+ Strategy errors with the same shape → pattern flagged as confidence/avoidance signal at the longitudinal level (e.g., consistent skipping of word problems → low confidence with applied math).

This separates *per-error classification* (be conservative) from *pattern detection* (look for repeated structure that signals a real gap). Both surface in the diagnostic output — different fields, different uses, different framings to the parent/teacher.

### Confidence scoring

Every diagnosis includes a confidence score (already in `PROJECT_BRIEF.md`'s diagnostic schema):

- **Clear-cut classification** (flowchart returns a category cleanly with one visible failure mode): confidence ≈ 0.85-0.95.
- **Tie-breaker invoked** (two categories genuinely fit, lighter chosen): confidence ≈ 0.55-0.7. The runner-up category goes into the `alternative_hypotheses` array.
- **Genuinely unclear** (neither flowchart nor tie-breaker resolves): confidence ≈ 0.35-0.5. Flag for human review.

Diagnoses with confidence < 0.6 are surfaced in the teacher-edit/review flow as "this one is worth your eyes."

---

## Special cases

### Right answer, wrong reasoning

Rare in math but happens. **Rule:** if the answer is correct, no error to classify. Don't punish the student for an unconventional path that happened to land correctly. (A teacher reviewing the work may flag pedagogically.)

### Multiple errors on the same problem

After classifying the first (upstream) error per the compound-errors rule, scan downstream:
- If a downstream step has an *additional independent* error (not caused by the upstream one), classify that separately and link it via a `caused_by` reference in the diagnostic record.
- If all downstream errors are direct consequences of the upstream one, document the cascade in `specific_description` and don't multi-classify.

### Off-domain answers

If a student writes something that doesn't engage with the problem at all (e.g., draws a picture instead of solving), classify as `strategy > no-attempt > skip` even though there's "work" — the work isn't on the problem.

---

## Post-launch roadmap

The v1 taxonomy is intentionally pragmatic and unblocks the diagnostic engine spec. Two sequential refinement phases are queued:

### Phase A: Pedagogy anchoring (~3-6 months post-launch, BEFORE school/district sales conversations)

Cite and reconcile this taxonomy with established frameworks:
- **Newman's Error Analysis** (1977, refined since) — five-stage model (read, comprehend, transform, process, encode). Maps loosely to our Conceptual/Execution split.
- **Common Core's 8 Mathematical Practices** — modeling, reasoning, precision, structure-seeing. Already overlaps with Verification and Strategy.
- **Bloom's misconceptions literature** — particularly for the Conceptual layer.
- **NCTM Process Standards** — problem solving, reasoning, communication, connections, representation. Cross-checks against Strategy.

Output: an "anchored" version of this doc that explicitly says "our 'Conceptual' category subsumes Newman's stages 1-3" and similar. Adds defensibility to skeptics, provides authority in marketing/sales conversations. ~1-2 weeks of focused reading + synthesis. Doable solo (no expert hire required for this phase).

### Phase B: Production-validated expert audit (ongoing, starting after 100+ real graded assessments)

Hire a consulting math educator (1-2 days/quarter) to audit a sample of real diagnostics generated by the system. They aren't *designing* the taxonomy in a vacuum — they're stress-testing it against real student work the system has already graded. Critiques inform refinements.

This honors the commitment in `PROJECT_BRIEF.md` §Quality Validation:
> Quarterly: expert audit of 50-100 random diagnostics

Phase A makes Phase B more efficient (the auditor compares findings to literature, not just to intuition).

### Why not a full from-scratch expert design

Expensive (~4-6 weeks of expert time), tends to over-engineer, and produces categories designed in vacuum rather than tested against real student work. The hybrid above gives 80% of the rigor for 20% of the cost.

---

## Out of scope (what comes next)

This doc is the design artifact. Three downstream specs consume it:

1. **Taxonomy schema + seeding spec** — DB tables (`error_categories`, `error_subcategories`, `error_patterns`), Alembic migration, idempotent seed script that loads this doc's content into the DB.
2. **Intervention library v1 spec** — `interventions` table, starter intervention content, tagging interventions to leaf patterns.
3. **Diagnostic engine spec** — Claude prompt design that uses this taxonomy at runtime via prompt-cached context. Implements the flowchart and tie-breaker rules.

Each gets its own brainstorm → plan → ship cycle.

---

## Appendix: extending the taxonomy

When a teacher / eval-set finding surfaces an error type not yet covered:

1. Determine which **existing top-level category** it belongs to via the flowchart.
2. Determine which **sub-category** it lands under (or, rarely, propose a new sub-category — this is a heavier change requiring discussion).
3. Add a **new leaf pattern** with: slug, name, description, canonical example, topic tags, severity hint.
4. Tag the leaf with the math topic(s) it appears in.
5. Optionally suggest associated intervention(s) (handled by the intervention library spec).

The leaf level is **append-only**; we never delete a leaf because diagnostic records reference them by id. Deprecated leaves get a `deprecated_at` timestamp and stop being suggested for new diagnoses, but historical records remain valid.
