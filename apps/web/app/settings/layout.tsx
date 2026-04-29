import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/api";
import { ShellHeader } from "@/components/shell-header";
import { SettingsTabs } from "@/components/settings-tabs";

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
      <div className="mx-auto max-w-[1100px] px-6 md:px-10">
        <SettingsTabs />
        <main className="py-10 md:py-14">{children}</main>
      </div>
    </div>
  );
}
