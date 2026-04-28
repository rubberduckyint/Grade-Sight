import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { SentryUserSync } from "./sentry-user-sync";

export function AppShell({
  children,
  orgName,
  userId,
  organizationId,
}: {
  children: ReactNode;
  orgName?: string | null;
  userId: string;
  organizationId: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SentryUserSync userId={userId} organizationId={organizationId} />
      <AppHeader orgName={orgName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
