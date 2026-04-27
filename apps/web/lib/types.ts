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
  original_filename: string;
  status: AssessmentStatus;
  uploaded_at: string;
}

export interface AssessmentUploadIntent {
  assessment_id: string;
  upload_url: string;
  key: string;
}
