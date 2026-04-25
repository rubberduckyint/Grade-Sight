import type { ReactNode } from "react";
import { AppHeader } from "./app-header";

export function AppShell({
  children,
  orgName,
}: {
  children: ReactNode;
  orgName?: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <AppHeader orgName={orgName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
