import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import type { UserResponse } from "@grade-sight/shared";

/**
 * Fetch the current user from our api, authenticated via the Clerk session.
 *
 * Server-only helper — uses Clerk's server-side `auth()` to get the
 * session token. Returns null on 401 (caller decides how to handle).
 */
export async function fetchMe(): Promise<UserResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`GET /api/me failed: ${response.status}`);
  }
  return (await response.json()) as UserResponse;
}
