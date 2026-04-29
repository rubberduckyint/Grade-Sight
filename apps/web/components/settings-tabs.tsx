"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Privacy", href: "/settings/privacy" },
  { label: "Billing", href: "/settings/billing" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings"
      className="flex gap-7 border-b border-rule-soft"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-3 text-base transition-colors",
              active
                ? "border-ink font-medium text-ink"
                : "border-transparent font-normal text-ink-soft hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
