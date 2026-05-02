import Link from "next/link";
import type { AnswerKey } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (iso === null) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function KeyRow({ ak }: { ak: AnswerKey }) {
  const href = `/keys/${ak.id}`;
  const lastUsed = ak.usage.used_count === 0 ? "Never" : formatDate(ak.usage.last_used_at);

  return (
    <tr className="border-t border-rule-soft hover:bg-paper-soft">
      <td className="align-baseline">
        <Link href={href} className="block py-4 pl-4 pr-4 font-serif text-base text-ink line-clamp-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {ak.name}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {ak.page_count}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {lastUsed}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {formatDate(ak.created_at)}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 text-right font-mono text-xs uppercase tracking-[0.1em] text-accent" aria-hidden="true">
          ›
        </Link>
      </td>
    </tr>
  );
}
