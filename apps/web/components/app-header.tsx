import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export function AppHeader({ orgName }: { orgName?: string | null }) {
  return (
    <header className="border-b border-rule-soft bg-paper">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 md:px-10">
        <Link
          href="/dashboard"
          className="font-serif text-xl tracking-[-0.01em] text-ink hover:opacity-80"
        >
          Grade Sight
        </Link>
        <div className="flex items-center gap-4">
          {orgName && <span className="text-sm text-ink-soft">{orgName}</span>}
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
