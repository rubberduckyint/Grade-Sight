"use server";

import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type {
  AnswerKeyUploadIntent,
  AssessmentListResponse,
  AssessmentUploadIntent,
  Student,
} from "./types";

async function callApi(path: string, init?: RequestInit): Promise<Response> {
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

export async function createStudent(input: {
  full_name: string;
  grade_level: number;
}): Promise<Student> {
  const response = await callApi(`/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/students failed: ${response.status}`);
  }
  return (await response.json()) as Student;
}

export async function createAssessmentForUpload(input: {
  student_id: string;
  files: { filename: string; content_type: string }[];
  answer_key_id?: string;
  already_graded?: boolean;
  review_all?: boolean;
}): Promise<AssessmentUploadIntent> {
  const response = await callApi(`/api/assessments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/assessments failed: ${response.status}`);
  }
  return (await response.json()) as AssessmentUploadIntent;
}

export async function deleteAssessment(id: string): Promise<void> {
  const response = await callApi(`/api/assessments/${id}`, {
    method: "DELETE",
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw new Error(`DELETE /api/assessments/${id} failed: ${response.status}`);
  }
}

export async function runDiagnostic(id: string): Promise<void> {
  const response = await callApi(`/api/assessments/${id}/diagnose`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`POST /api/assessments/${id}/diagnose failed: ${response.status}`);
  }
}

export async function createAnswerKeyForUpload(input: {
  name: string;
  files: { filename: string; content_type: string }[];
}): Promise<AnswerKeyUploadIntent> {
  const response = await callApi(`/api/answer-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`POST /api/answer-keys failed: ${response.status}`);
  }
  return (await response.json()) as AnswerKeyUploadIntent;
}

export async function deleteAnswerKey(id: string): Promise<void> {
  const response = await callApi(`/api/answer-keys/${id}`, {
    method: "DELETE",
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw new Error(`DELETE /api/answer-keys/${id} failed: ${response.status}`);
  }
}

export async function deleteSelf(): Promise<void> {
  const response = await callApi("/api/me/delete", { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/me/delete failed: ${response.status}`);
  }
}

export async function loadAssessments(opts?: {
  limit?: number;
  since?: string;
  until?: string;
  cursor?: string;
}): Promise<AssessmentListResponse> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.since) params.set("since", opts.since);
  if (opts?.until) params.set("until", opts.until);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const url = `/api/assessments${qs ? `?${qs}` : ""}`;
  const response = await callApi(url, { method: "GET" });
  if (response.status === 401)
    return { assessments: [], has_more: false, next_cursor: null };
  if (!response.ok) throw new Error(`GET /api/assessments failed: ${response.status}`);
  return (await response.json()) as AssessmentListResponse;
}
