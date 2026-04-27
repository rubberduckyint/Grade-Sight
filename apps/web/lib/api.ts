import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { UserResponse } from "@grade-sight/shared";

export interface EntitlementResponse {
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: "parent_monthly" | "teacher_monthly" | null;
  is_entitled: boolean;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    throw new Error("No session token");
  }
  return fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
}

export async function fetchMe(): Promise<UserResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/me failed: ${response.status}`);
  return (await response.json()) as UserResponse;
}

export async function fetchEntitlement(): Promise<EntitlementResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/me/entitlement`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/me/entitlement failed: ${response.status}`);
  return (await response.json()) as EntitlementResponse;
}

export async function createCheckoutSession(): Promise<string> {
  const response = await authedFetch(`/api/billing/checkout`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/billing/checkout failed: ${response.status}`);
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}

export async function createPortalSession(): Promise<string> {
  const response = await authedFetch(`/api/billing/portal`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/billing/portal failed: ${response.status}`);
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}

// ---- Students ----

export interface Student {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  created_at: string;
}

export async function fetchStudents(): Promise<Student[]> {
  const response = await authedFetch(`/api/students`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/students failed: ${response.status}`);
  const body = (await response.json()) as { students: Student[] };
  return body.students;
}

export async function createStudent(input: {
  full_name: string;
  date_of_birth?: string;
}): Promise<Student> {
  const response = await authedFetch(`/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/students failed: ${response.status}`);
  }
  return (await response.json()) as Student;
}

// ---- Assessments ----

export type AssessmentStatus = "pending" | "processing" | "completed" | "failed";

export interface AssessmentListItem {
  id: string;
  student_id: string;
  student_name: string;
  original_filename: string;
  status: AssessmentStatus;
  uploaded_at: string;
}

export async function fetchAssessments(opts?: { limit?: number }): Promise<AssessmentListItem[]> {
  const limit = opts?.limit ?? 20;
  const response = await authedFetch(`/api/assessments?limit=${limit}`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/assessments failed: ${response.status}`);
  const body = (await response.json()) as { assessments: AssessmentListItem[] };
  return body.assessments;
}

export interface AssessmentUploadIntent {
  assessment_id: string;
  upload_url: string;
  key: string;
}

export async function createAssessmentForUpload(input: {
  student_id: string;
  original_filename: string;
  content_type: string;
}): Promise<AssessmentUploadIntent> {
  const response = await authedFetch(`/api/assessments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/assessments failed: ${response.status}`);
  }
  return (await response.json()) as AssessmentUploadIntent;
}
