import type { ReactNode } from "react";
import { AuthHeader } from "@/components/auth-header";

// Shared chrome for /sign-in, /sign-up/parent, /sign-up/teacher.
// Route group `(auth)` doesn't change URLs — these routes still mount
// at their original paths.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <AuthHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
