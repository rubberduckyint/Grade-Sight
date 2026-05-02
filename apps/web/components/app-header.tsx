import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { GSLogo } from "@/components/gs-logo";
import { cn } from "@/lib/utils";

export type AppHeaderTab = { label: string; href: string };

export function AppHeader({
  tabs,
  activeHref,
  uploadHref,
  uploadLabel = "Upload assessment",
}: {
  tabs?: AppHeaderTab[];
  activeHref?: string;
  uploadHref?: string;
  uploadLabel?: string;
}) {
  return (
    <header className="border-b border-rule-soft bg-paper">
      <div className="mx-auto flex max-w-[1200px] items-stretch justify-between px-6 py-3.5 md:px-10">
        <div className="flex items-end gap-9">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-ink hover:opacity-80"
          >
            <GSLogo size={22} />
            <span className="font-serif text-xl font-medium tracking-[-0.012em]">
              Grade Sight
            </span>
          </Link>
          {tabs && tabs.length > 0 && (
            <nav className="flex items-end gap-7" aria-label="Main">
              {tabs.map((tab) => {
                const active = tab.href === activeHref;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "border-b-2 pb-3.5 text-base transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
                      "focus-visible:rounded-[var(--radius-sm)]",
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
          )}
        </div>
        <div className="flex items-center gap-4">
          {uploadHref && (
            <Button asChild>
              <Link href={uploadHref}>{uploadLabel}</Link>
            </Button>
          )}
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-9 w-9 ring-1 ring-rule",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}
