import type { ReactNode } from "react";
import { AppHeader, type AppHeaderTab } from "./app-header";
import { SentryUserSync } from "./sentry-user-sync";

export function AppShell({
  children,
  orgName,
  userId,
  organizationId,
  tabs,
  activeHref,
  uploadHref,
  uploadLabel,
}: {
  children: ReactNode;
  orgName?: string | null;
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
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-sm)] focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to main content
      </a>
      <SentryUserSync userId={userId} organizationId={organizationId} />
      <AppHeader
        orgName={orgName}
        tabs={tabs}
        activeHref={activeHref}
        uploadHref={uploadHref}
        uploadLabel={uploadLabel}
      />
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
