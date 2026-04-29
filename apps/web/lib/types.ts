export interface EntitlementResponse {
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: "parent_monthly" | "teacher_monthly" | null;
  is_entitled: boolean;
}

export interface Student {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  created_at: string;
}

export type AssessmentStatus = "pending" | "processing" | "completed" | "failed";

export interface AssessmentListItem {
  id: string;
  student_id: string;
  student_name: string;
  page_count: number;
  first_page_thumbnail_url: string;
  status: AssessmentStatus;
  uploaded_at: string;
}

export interface AssessmentPageUploadIntent {
  page_number: number;
  key: string;
  upload_url: string;
}

export interface AssessmentUploadIntent {
  assessment_id: string;
  pages: AssessmentPageUploadIntent[];
}

export interface AssessmentDetailPage {
  page_number: number;
  original_filename: string;
  view_url: string;
}

export interface AssessmentDetail {
  id: string;
  student_id: string;
  student_name: string;
  status: AssessmentStatus;
  uploaded_at: string;
  pages: AssessmentDetailPage[];
  diagnosis: AssessmentDiagnosis | null;
  answer_key: AssessmentDetailAnswerKey | null;
}

export interface ProblemObservation {
  id: string;
  problem_number: number;
  page_number: number;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  error_pattern_slug: string | null;
  error_pattern_name: string | null;
  error_category_slug: string | null;
  error_description: string | null;
  solution_steps: string | null;
}

export interface AssessmentDiagnosis {
  id: string;
  model: string;
  overall_summary: string | null;
  cost_usd: number;
  latency_ms: number;
  created_at: string;
  problems: ProblemObservation[];
  analysis_mode: "auto_grade" | "with_key" | "already_graded";
  total_problems_seen: number | null;
}

// ---- Answer keys ----

export interface AnswerKey {
  id: string;
  name: string;
  page_count: number;
  first_page_thumbnail_url: string;
  created_at: string;
}

export interface AnswerKeyDetailPage {
  page_number: number;
  original_filename: string;
  view_url: string;
}

export interface AnswerKeyDetail {
  id: string;
  name: string;
  created_at: string;
  pages: AnswerKeyDetailPage[];
}

export interface AnswerKeyPageUploadIntent {
  page_number: number;
  key: string;
  upload_url: string;
}

export interface AnswerKeyUploadIntent {
  answer_key_id: string;
  pages: AnswerKeyPageUploadIntent[];
}

export interface AssessmentDetailAnswerKey {
  id: string;
  name: string;
  page_count: number;
}

// ---- Billing prices ----

export interface PriceInfo {
  plan: string;
  unit_amount: number;
  currency: string;
  interval: string;
}

export interface PricesResponse {
  prices: {
    parent_monthly: PriceInfo;
    teacher_monthly: PriceInfo;
  };
}

export interface TrialStats {
  assessmentCount: number;
  interventionCount: number;
  weeksOfHistory: number;
}
