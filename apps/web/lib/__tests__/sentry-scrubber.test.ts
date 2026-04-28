import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/lib/sentry-scrubber";

describe("scrubEvent", () => {
  it("strips request headers", () => {
    const cleaned = scrubEvent({
      request: {
        headers: { authorization: "Bearer abc", cookie: "session=xyz" },
        url: "https://app.example.com/dashboard",
      },
    });
    expect(cleaned).not.toBeNull();
    expect((cleaned?.request as Record<string, unknown>)?.headers).toBeUndefined();
    expect((cleaned?.request as Record<string, unknown>)?.url).toBe(
      "https://app.example.com/dashboard",
    );
  });

  it("strips request cookies", () => {
    const cleaned = scrubEvent({
      request: { cookies: { __session: "abc" } },
    });
    expect((cleaned?.request as Record<string, unknown>)?.cookies).toBeUndefined();
  });

  it("strips request body data", () => {
    const cleaned = scrubEvent({
      request: { data: { student_name: "Lily", original_filename: "Lily.pdf" } },
    });
    expect((cleaned?.request as Record<string, unknown>)?.data).toBeUndefined();
  });

  it("strips query strings", () => {
    const cleaned = scrubEvent({
      request: { query_string: "email=lily@example.com" },
    });
    expect((cleaned?.request as Record<string, unknown>)?.query_string).toBeUndefined();
  });

  it("redacts emails in messages", () => {
    const cleaned = scrubEvent({
      message: "Failed to send to lily@example.com — retrying",
    });
    expect(cleaned?.message as string).not.toContain("lily@example.com");
    expect(cleaned?.message as string).toContain("[redacted-email]");
  });

  it("redacts presigned R2 URLs in messages", () => {
    const cleaned = scrubEvent({
      message:
        "Upload error: https://abc.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=foo",
    });
    expect(cleaned?.message as string).not.toContain("r2.cloudflarestorage.com");
  });

  it("preserves user.id and strips email/username/ip", () => {
    const cleaned = scrubEvent({
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "lily@example.com",
        username: "lily.smith",
        ip_address: "203.0.113.5",
      },
    });
    expect(cleaned?.user).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("preserves non-PII fields", () => {
    const cleaned = scrubEvent({
      tags: { environment: "production", release: "abc", service: "web" },
      level: "error",
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    });
    expect((cleaned?.tags as Record<string, unknown>)?.release).toBe("abc");
    const values = (cleaned?.exception as { values?: Array<{ type?: string }> })?.values;
    expect(values?.[0]?.type).toBe("TypeError");
  });

  it("returns null when scrub itself throws", () => {
    // Force scrubber failure: feed a non-object to the regex code path.
    const cleaned = scrubEvent(null as unknown as Record<string, unknown>);
    expect(cleaned).toBeNull();
  });
});
