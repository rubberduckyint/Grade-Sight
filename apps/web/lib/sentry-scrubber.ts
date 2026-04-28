/**
 * Sentry beforeSend hook for the Next.js app — strips PII before any event
 * leaves the browser/server.
 *
 * Mirrors the backend scrubber at apps/api/.../sentry_scrubber.py. Returns
 * null to drop the event entirely if scrubbing itself raises.
 */

type SentryEvent = Record<string, unknown>;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const R2_URL_RE = /https:\/\/[A-Za-z0-9.\-]+\.r2\.cloudflarestorage\.com\/\S*/g;

function redactString(s: string): string {
  return s.replace(EMAIL_RE, "[redacted-email]").replace(R2_URL_RE, "[redacted-r2-url]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scrubEvent(event: SentryEvent): SentryEvent | null {
  try {
    if (!isRecord(event)) {
      throw new TypeError("event is not a record");
    }

    // 1. Bulk-remove request body fields.
    const request = event.request;
    if (isRecord(request)) {
      delete request.headers;
      delete request.cookies;
      delete request.data;
      delete request.query_string;
    }

    // 2. Strip non-allowlisted user fields.
    const user = event.user;
    if (isRecord(user)) {
      const id = user.id;
      event.user = id !== undefined ? { id } : {};
    }

    // 3. Redact email + R2 URL patterns from message.
    if (typeof event.message === "string") {
      event.message = redactString(event.message);
    }

    return event;
  } catch (e) {
    // Console-only; we intentionally do NOT capture this back to Sentry to
    // avoid loops. Lost events are safer than leaked PII.
    console.warn("sentry scrubEvent raised; dropping event", e);
    return null;
  }
}
