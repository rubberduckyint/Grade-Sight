# Grade-Sight — Project Brief

## Product Thesis

A diagnostic grading platform that identifies *why* students lose points, not just *where*. Core differentiator: error pattern recognition across four categories (conceptual, execution, verification, confidence/strategy) with longitudinal tracking per student. Initial domain: secondary math (Algebra through Pre-Calc) under California Common Core.

## Four Product Pillars

1. **Individual student diagnostic engine** — The foundation. Upload graded assessment, receive diagnosis of error types and patterns.
2. **Dual-expert intervention engine** — Subject matter expert + cognitive science lens, producing simple memorable interventions (CHEC-style bar).
3. **Cohort/class pulse** — Real-time class-level error pattern detection (phase 2).
4. **Stakeholder communication layer** — Same analysis, different outputs for student, teacher, administrator.

## Go-To-Market

Dual-channel from MVP:
- **Parent mode**: one to a few students, kid-facing interventions, parent summaries. Primary channel for early traction.
- **Teacher mode (individual)**: class grouping, batch upload, teacher-facing diagnostics. Bottoms-up SaaS wedge toward eventual district sales.
- **District/enterprise**: deferred to phase 3+, enabled by compliance posture.

Competitive positioning: **privacy and compliance as acquisition lever**. More specific commitments than any competitor, enabling permission-to-use in institutional contexts.

## Tech Stack

- **Frontend**: Next.js + Tailwind + shadcn/ui
- **Backend**: Python + FastAPI
- **Database**: Postgres (via Supabase or Railway-managed)
- **Auth**: Clerk (supports role-based access, organizations)
- **LLM**: Anthropic Claude API (Sonnet 4.6 for reasoning, Haiku 4.5 for classification/output)
- **Storage**: S3-compatible object storage
- **Deployment**: Railway (US region, pinned)
- **Monitoring**: Sentry
- **Email**: Resend

## Model Routing Strategy

Per-assessment pipeline, routed by step:
1. Image intake/transcription: Sonnet 4.6 (vision)
2. Scoring vs answer key: deterministic code, no LLM
3. Error identification on wrong answers: Sonnet 4.6
4. Error classification against taxonomy: Haiku 4.5
5. Intervention matching: database lookup, no LLM
6. Longitudinal pattern analysis: Sonnet 4.6, async weekly
7. Output rendering per audience: Haiku 4.5

Batch API (50% discount) for teacher batch uploads. Prompt caching on taxonomy/rubric context (critical for cost).

Target cost per assessment: ~$0.038 with routing and caching.

## Architectural Non-Negotiables

### Must be in schema from day one
- **Consent flags** on every student record (JSONB, expandable)
- **Multi-tenancy**: organization_id on everything, nullable for parent accounts
- **Audit log** table as first-class citizen (user, timestamp, resource, action)
- **Soft deletion** with retention windows and background hard-delete job
- **PII separation**: student names/identifiers in one table, learning data in another, linked by ID

### Must be in architecture early
- **External service abstraction**: all Claude/S3/Sentry calls through centralized service layer
- **Encryption** at rest and in transit, verified
- **Region-pinned** deployment (US), parameterized for future flexibility
- **Taxonomy as data**, not code — loaded from database at runtime, never hardcoded in prompts

### MVP features
- User data controls page (view, export, delete)
- Inline diagnostic editing with logged corrections (quality validation pipeline)
- Eval set automation (script runs against hand-graded assessments)
- Cost tracking logged on every LLM call
- End-to-end deletion (including backups, 30-day retention)

## Privacy & Compliance Posture

Positioning: **more specifically committed than any competitor**, without over-constraining future options.

### Hard commitments (can appear in policy and marketing)
- Never sell student data
- No advertising or behavioral profiling of students
- No third-party commercial sharing
- US-only data storage (Railway US region)
- Published subprocessor list, 30-day change notification
<!-- TODO (Spec 13 Sentry monitoring): when the public subprocessor list is drafted with edtech counsel, include Sentry alongside Anthropic, Cloudflare, Clerk, Stripe, Resend, Railway. Add the pseudonymous-diagnostics paragraph (CLAUDE.md §4) to the privacy policy at the same time. -->
- 30-day deletion window on request, including backups
- Data minimization: collect only what's needed
- SDPC NDPA signable
- Student Privacy Pledge signatory
- Common Sense Privacy evaluation pursued
- Privacy policy reviewed by edtech counsel
- 72-hour incident notification

### Soft commitments (flexibility preserved)
- Data used to provide and improve the service
- Anonymized/aggregated patterns used for product improvement
- No data sold to AI companies for foundation model training (the specific fear)

### Deferred
- SOC 2 Type I — triggered by specific deal requirement or revenue threshold
- iKeepSafe FERPA certification — after product stability
- State-specific compliance beyond CA — as sales geography demands

## Diagnostic Output Schema

Interface contract between diagnostic engine and UI/storage. Draft structure:

```json
{
  "assessment_id": "uuid",
  "student_id": "uuid",
  "graded_at": "timestamp",
  "overall_score": {
    "points_earned": 0,
    "points_possible": 0,
    "percentage": 0
  },
  "problems": [
    {
      "problem_number": 1,
      "student_work": "transcribed or described",
      "student_answer": "final answer from student",
      "correct_answer": "from answer key",
      "is_correct": true,
      "is_blank": false,
      "error_analysis": {
        "taxonomy_node_id": "uuid",
        "taxonomy_path": "execution > arithmetic > sign_error",
        "confidence": 0.85,
        "specific_description": "Student distributed negative correctly but dropped sign in step 3",
        "step_where_error_occurred": 3,
        "alternative_hypotheses": []
      },
      "suggested_intervention_id": "uuid"
    }
  ],
  "patterns_detected": [
    {
      "pattern": "recurring sign errors when distributing",
      "evidence_problem_numbers": [1, 4, 7],
      "confidence": 0.9
    }
  ],
  "metadata": {
    "model_used": "claude-sonnet-4-6",
    "tokens_input": 0,
    "tokens_output": 0,
    "cost_usd": 0.0,
    "pipeline_version": "1.0"
  },
  "human_reviewed": false,
  "human_corrections": []
}
```

## Key Data Model Entities

- `organizations` (nullable for parent accounts)
- `users` (with role: parent, teacher, admin; organization_id)
- `students` (PII: name, identifiers)
- `student_profiles` (learning data, separated from PII)
- `classes` (teacher-owned, organization-scoped)
- `class_members` (students in classes)
- `assessments` (uploaded work, images in S3, linked to student and optionally class)
- `answer_keys` (per assignment)
- `diagnostic_records` (the JSON above, structured)
- `error_categories` (taxonomy, loaded as data)
- `error_patterns` (leaf nodes of taxonomy)
- `interventions` (library content, tagged to patterns)
- `intervention_recommendations` (log of what was suggested when)
- `intervention_outcomes` (tracking whether errors resolved)
- `diagnostic_reviews` (human corrections for quality validation)
- `consent_flags` (on students, expandable JSONB)
- `audit_log` (every data access)
- `llm_call_logs` (cost tracking, per call)
- `subprocessors` (published list, changelog)

## Phased Build Plan

### Phase 1 (MVP, months 1-3)
Parent mode + individual teacher mode. Single-assessment upload → diagnostic → intervention. Longitudinal per student. Class as organizational unit for teachers. Core compliance scaffolding.

### Phase 2 (months 4-6)
Batch upload for teachers. Longitudinal pattern surfacing. Intervention library growth. Teacher-market fit push. SDPC membership, Common Sense evaluation, Student Privacy Pledge.

### Phase 3 (months 7-12)
Cohort pulse features. Admin dashboards. LMS integrations. SOC 2 Type I. First district deals.

## Quality Validation

Three time scales:
1. **Per-assessment**: teacher edits logged to `diagnostic_reviews`
2. **Week-over-week**: automated eval set (50+ hand-graded assessments) run on prompt/model changes
3. **Quarterly**: expert audit of 50-100 random diagnostics

Every change that could affect diagnostic quality runs against the eval set before shipping.

## Cost Tracking

Every LLM call logged: user_id, model, tokens_in, tokens_out, cost, latency, timestamp. Dashboard shows cost-per-user, cost-per-assessment, cost-per-segment over time. Investor-ready from day one.
