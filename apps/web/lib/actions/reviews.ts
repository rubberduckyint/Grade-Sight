"use server";

import { auth } from "@clerk/nextjs/server";

import { env } from "@/env";
import type { DiagnosticReview } from "@/lib/types";

interface CreateReviewPayload {
  problem_number: number;
  override_pattern_id?: string | null;
  marked_correct: boolean;
  note?: string | null;
}

interface UpdateReviewPayload {
  override_pattern_id?: string | null;
  marked_correct?: boolean;
  note?: string | null;
}

async function getToken(): Promise<string> {
  const { getToken: get } = await auth();
  const token = await get();
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function createReview(
  assessmentId: string,
  payload: CreateReviewPayload,
): Promise<DiagnosticReview> {
  const token = await getToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/assessments/${assessmentId}/reviews`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Create review failed: ${response.status}`);
  }
  return (await response.json()) as DiagnosticReview;
}

export async function updateReview(
  assessmentId: string,
  reviewId: string,
  payload: UpdateReviewPayload,
): Promise<DiagnosticReview> {
  const token = await getToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/assessments/${assessmentId}/reviews/${reviewId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Update review failed: ${response.status}`);
  }
  return (await response.json()) as DiagnosticReview;
}

export async function deleteReview(
  assessmentId: string,
  reviewId: string,
): Promise<void> {
  const token = await getToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/assessments/${assessmentId}/reviews/${reviewId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(text || `Delete review failed: ${response.status}`);
  }
}
