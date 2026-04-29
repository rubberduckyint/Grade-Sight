import Link from "next/link";
import { GSLogo } from "@/components/gs-logo";

interface ShellHeaderProps {
  rightLabel: string;
  rightHref?: string;
  homeHref?: string;
}

// Minimal post-auth header for /settings/* and /paywall — same brand
// chrome as AppHeader (logo + serif wordmark, border-b rule-soft) but
// no tabs / upload / avatar. Right side is one short text label that
// can optionally link somewhere.
export function ShellHeader({
  rightLabel,
  rightHref,
  homeHref = "/dashboard",
}: ShellHeaderProps) {
  return (
    <header className="border-b border-rule-soft bg-paper">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link
          href={homeHref}
          className="flex items-center gap-2.5 text-ink hover:opacity-80"
        >
          <GSLogo size={22} />
          <span className="font-serif text-xl font-medium tracking-[-0.012em]">
            Grade Sight
          </span>
        </Link>
        {rightHref ? (
          <Link
            href={rightHref}
            className="text-sm text-ink-soft hover:text-ink"
          >
            {rightLabel}
          </Link>
        ) : (
          <span className="text-sm text-ink-soft">{rightLabel}</span>
        )}
      </div>
    </header>
  );
}
