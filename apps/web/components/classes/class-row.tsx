import Link from "next/link";
import type { Klass } from "@/lib/types";

export function ClassRow({ klass }: { klass: Klass }) {
  const href = `/classes/${klass.id}`;
  const archivedClass = klass.archived ? "opacity-60" : "";
  return (
    <tr className={`border-t border-rule-soft hover:bg-paper-soft ${archivedClass}`}>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pl-4 pr-4 font-serif text-base text-ink line-clamp-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {klass.name}
          {klass.archived && (
            <span className="ml-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">archived</span>
          )}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-serif text-base text-ink-soft">
          {klass.subject ?? "—"}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {klass.grade_level ?? "—"}
        </Link>
      </td>
      <td className="align-baseline">
        <Link href={href} className="block py-4 pr-4 font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
          {klass.student_count}
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
