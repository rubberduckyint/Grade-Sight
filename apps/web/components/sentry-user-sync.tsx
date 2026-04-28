"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface SentryUserSyncProps {
  userId: string;
  organizationId: string | null;
}

export function SentryUserSync({ userId, organizationId }: SentryUserSyncProps) {
  useEffect(() => {
    try {
      Sentry.setUser({ id: userId });
      if (organizationId !== null) {
        Sentry.setTag("organization_id", organizationId);
      }
    } catch {
      // Privacy/observability infra is best-effort. A misconfigured Sentry
      // must never break the user-facing render path.
    }
  }, [userId, organizationId]);

  return null;
}
