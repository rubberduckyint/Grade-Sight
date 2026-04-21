// Day-one types for Grade-Sight.
// Each type mirrors a Pydantic class in apps/api; the Python side remains the
// source of truth for runtime validation. Update both when changing a shape.

// Mirrors OrganizationId (Pydantic) — see apps/api/src/grade_sight_api/models.py when created.
export type OrganizationId = string & { readonly __brand: "OrganizationId" };

// Mirrors StudentId (Pydantic).
export type StudentId = string & { readonly __brand: "StudentId" };

// Mirrors AssessmentId (Pydantic).
export type AssessmentId = string & { readonly __brand: "AssessmentId" };

// Mirrors UserRole enum (Pydantic).
export type UserRole = "parent" | "teacher" | "admin";

// Skeleton for the diagnostic record. Full shape lives in
// docs/PROJECT_BRIEF.md §Diagnostic Output Schema. Expanded in a later spec
// once the diagnostic engine work begins.
export interface DiagnosticRecord {
  assessment_id: AssessmentId;
  student_id: StudentId;
  graded_at: string; // ISO 8601
}
