import Link from "next/link";
import { GSLogo } from "@/components/gs-logo";

// Pre-auth header for /sign-in, /sign-up/parent, /sign-up/teacher.
// Same brand chrome as AppHeader (logo + serif wordmark, border-b
// rule-soft) but without tabs / upload / avatar — none of those are
// meaningful before the user is signed in. Right side is a single
// "Back to home" exit so users who landed on auth from a stale link
// have a way out that isn't the browser back button.
export function AuthHeader() {
  return (
    <header className="border-b border-rule-soft bg-paper">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-ink hover:opacity-80"
        >
          <GSLogo size={22} />
          <span className="font-serif text-xl font-medium tracking-[-0.012em]">
            Grade Sight
          </span>
        </Link>
        <Link
          href="/"
          className="text-sm text-ink-mute hover:text-ink"
        >
          ← Back to home
        </Link>
      </div>
    </header>
  );
}
