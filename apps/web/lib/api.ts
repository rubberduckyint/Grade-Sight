import "server-only";

import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { UserResponse } from "@grade-sight/shared";

export type {
  AnswerKey,
  AnswerKeyDetail,
  AssessmentDetail,
  AssessmentListItem,
  AssessmentListResponse,
  AssessmentStatus,
  AssessmentUploadIntent,
  DiagnosticReview,
  EntitlementResponse,
  ErrorPattern,
  HeadlineInputs,
  HeadlineProblem,
  PriceInfo,
  PricesResponse,
  Student,
  StudentBiography,
  TrialStats,
} from "./types";

import type {
  AnswerKey,
  AnswerKeyDetail,
  AssessmentDetail,
  AssessmentListResponse,
  EntitlementResponse,
  ErrorPattern,
  PricesResponse,
  Student,
  StudentBiography,
  TrialStats,
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

export async function fetchPrices(): Promise<PricesResponse> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/billing/prices`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET /api/billing/prices failed: ${response.status}`);
  }
  return (await response.json()) as PricesResponse;
}

// TODO(step-11): wire to aggregation endpoints once they land.
// assessmentCount, interventionCount, and weeksOfHistory will come from
// the data layer. Until then, /paywall right column gracefully omits.
// Note: the step-11 tag is a historical breadcrumb, not a commitment —
// v2 Step 11 is Inline correction + viewer and does NOT cover this.
// Step 12 (Student Page biography) is the closest natural neighbor.
// See docs/superpowers/plans/followups.md.
export async function getTrialStats(_userId: string): Promise<TrialStats | null> {
  return null;
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

export async function fetchAssessments(opts?: {
  limit?: number;
  since?: string; // ISO date "YYYY-MM-DD"
  until?: string;
  cursor?: string; // ISO datetime
}): Promise<AssessmentListResponse> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.since) params.set("since", opts.since);
  if (opts?.until) params.set("until", opts.until);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const url = `/api/assessments${qs ? `?${qs}` : ""}`;
  const response = await authedFetch(url, { method: "GET" });
  if (response.status === 401)
    return { assessments: [], has_more: false, next_cursor: null };
  if (!response.ok) throw new Error(`GET /api/assessments failed: ${response.status}`);
  return (await response.json()) as AssessmentListResponse;
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

export async function fetchAnswerKeyDetail(id: string): Promise<AnswerKeyDetail | null> {
  const response = await authedFetch(`/api/answer-keys/${id}`, { method: "GET" });
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /api/answer-keys/${id} failed: ${response.status}`);
  return (await response.json()) as AnswerKeyDetail;
}

// ---- Error patterns ----

export async function fetchErrorPatterns(): Promise<ErrorPattern[]> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return [];

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/error-patterns`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET /api/error-patterns failed: ${response.status}`);
  }
  return (await response.json()) as ErrorPattern[];
}

// ---- Student biography ----

export async function fetchStudentBiography(
  id: string,
  weeks?: number,
): Promise<StudentBiography | null> {
  const qs = weeks ? `?weeks=${weeks}` : "";
  const response = await authedFetch(`/api/students/${id}/biography${qs}`, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET /api/students/${id}/biography failed: ${response.status}`);
  }
  return (await response.json()) as StudentBiography;
}
