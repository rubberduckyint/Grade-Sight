import "server-only";

import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { UserResponse } from "@grade-sight/shared";

export type {
  AnswerKey,
  AssessmentDetail,
  AssessmentListItem,
  AssessmentStatus,
  AssessmentUploadIntent,
  EntitlementResponse,
  Student,
} from "./types";

import type {
  AnswerKey,
  AssessmentDetail,
  AssessmentListItem,
  EntitlementResponse,
  Student,
} from "./types";

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

export async function fetchStudents(): Promise<Student[]> {
  const response = await authedFetch(`/api/students`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/students failed: ${response.status}`);
  const body = (await response.json()) as { students: Student[] };
  return body.students;
}

// ---- Assessments ----

export async function fetchAssessments(opts?: { limit?: number }): Promise<AssessmentListItem[]> {
  const limit = opts?.limit ?? 20;
  const response = await authedFetch(`/api/assessments?limit=${limit}`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/assessments failed: ${response.status}`);
  const body = (await response.json()) as { assessments: AssessmentListItem[] };
  return body.assessments;
}

export async function fetchAssessmentDetail(id: string): Promise<AssessmentDetail | null> {
  const response = await authedFetch(`/api/assessments/${id}`, { method: "GET" });
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /api/assessments/${id} failed: ${response.status}`);
  return (await response.json()) as AssessmentDetail;
}

// ---- Answer keys ----

export async function fetchAnswerKeys(): Promise<AnswerKey[]> {
  const response = await authedFetch(`/api/answer-keys`, { method: "GET" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`GET /api/answer-keys failed: ${response.status}`);
  const body = (await response.json()) as { answer_keys: AnswerKey[] };
  return body.answer_keys;
}
