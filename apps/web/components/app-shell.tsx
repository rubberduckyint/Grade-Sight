import type { ReactNode } from "react";
import { AppHeader, type AppHeaderTab } from "./app-header";
import { SentryUserSync } from "./sentry-user-sync";

export function AppShell({
  children,
  userId,
  organizationId,
  tabs,
  activeHref,
  uploadHref,
  uploadLabel,
}: {
  children: ReactNode;
  userId: string;
  organizationId: string | null;
  tabs?: AppHeaderTab[];
  activeHref?: string;
  uploadHref?: string;
  uploadLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-[var(--radius-sm)] focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-paper"
      >
        Skip to main content
      </a>
      <SentryUserSync userId={userId} organizationId={organizationId} />
      <AppHeader
        tabs={tabs}
        activeHref={activeHref}
        uploadHref={uploadHref}
        uploadLabel={uploadLabel}
      />
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
