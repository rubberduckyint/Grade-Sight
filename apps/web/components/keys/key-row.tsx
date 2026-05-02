import type { AnswerKey } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (iso === null) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function KeyRow({ ak }: { ak: AnswerKey }) {
  const pages = `${ak.page_count} ${ak.page_count === 1 ? "page" : "pages"}`;
  const usage = ak.usage.used_count === 0
    ? "Never used yet"
    : `Used ${ak.usage.used_count}× · last ${formatDate(ak.usage.last_used_at)}`;

  return (
    <li className="flex items-baseline justify-between gap-6 py-4">
      <span className="font-serif text-lg leading-tight text-ink line-clamp-1">{ak.name}</span>
      <span className="flex items-baseline gap-3 font-mono text-xs uppercase tracking-[0.06em] text-ink-mute whitespace-nowrap">
        <span>{pages}</span>
        <span aria-hidden="true">·</span>
        <span>{usage}</span>
      </span>
    </li>
  );
}
