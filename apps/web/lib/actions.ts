"use server";

import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { Student, AssessmentUploadIntent } from "./types";

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
  date_of_birth?: string;
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
  original_filename: string;
  content_type: string;
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
