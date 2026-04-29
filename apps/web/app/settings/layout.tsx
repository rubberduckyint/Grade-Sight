import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/api";
import { ShellHeader } from "@/components/shell-header";
import { SettingsRail } from "@/components/settings-rail";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await fetchMe();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-paper">
      <ShellHeader rightLabel="Settings" />
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 px-6 py-12 md:grid-cols-[200px_1fr] md:px-10 md:py-16">
        <SettingsRail />
        <main>{children}</main>
      </div>
    </div>
  );
}
