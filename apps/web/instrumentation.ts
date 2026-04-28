import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrubber";

export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const environment = process.env.NODE_ENV;

  if (environment !== "production" || !dsn) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn,
      environment,
      release: process.env.RAILWAY_GIT_COMMIT_SHA,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend: (event) =>
        scrubEvent(event as unknown as Record<string, unknown>) as typeof event | null,
    });
    Sentry.setTag("service", "web-server");
  }
}

export const onRequestError = Sentry.captureRequestError;
