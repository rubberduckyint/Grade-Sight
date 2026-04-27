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
}
