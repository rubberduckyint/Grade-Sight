import Image from "next/image";
import type { AnswerKey } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (iso === null) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function KeyCard({ ak }: { ak: AnswerKey }) {
  const usage = ak.usage.used_count === 0
    ? "Never used yet"
    : `Used ${ak.usage.used_count}× · last ${formatDate(ak.usage.last_used_at)}`;

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-rule bg-paper">
      <div className="relative aspect-[3/2] bg-paper-soft border-b border-rule-soft">
        {ak.first_page_thumbnail_url && (
          <Image
            src={ak.first_page_thumbnail_url}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-contain"
          />
        )}
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-baseline justify-end font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          <span>{ak.page_count} {ak.page_count === 1 ? "page" : "pages"}</span>
        </div>
        <p className="font-serif text-lg leading-tight text-ink line-clamp-2">{ak.name}</p>
        <p className="text-sm text-ink-soft">{usage}</p>
      </div>
    </div>
  );
}
