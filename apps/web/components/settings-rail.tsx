"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Privacy", href: "/settings/privacy" },
  { label: "Billing", href: "/settings/billing" },
];

export function SettingsRail() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col" aria-label="Settings">
      <span className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Settings
      </span>
      <ul className="flex flex-col">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex border-l-2 px-4 py-2.5 text-base transition-colors",
                  active
                    ? "border-ink font-medium text-ink"
                    : "border-rule-soft text-ink-soft hover:border-ink-mute hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
