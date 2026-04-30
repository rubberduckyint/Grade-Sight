interface ViewerPage {
  page_number: number;
  original_filename: string;
  view_url: string;
}

export function ViewerPanel({
  label,
  pages,
}: {
  label: string;
  pages: ViewerPage[];
}) {
  const total = pages.length;
  const sorted = [...pages].sort((a, b) => a.page_number - b.page_number);

  return (
    <section
      aria-label={label}
      className="flex flex-col gap-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-2"
    >
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute sticky top-0 bg-paper py-2 z-10">
        {label} · {total} {total === 1 ? "page" : "pages"}
      </p>
      <ul className="flex flex-col gap-6">
        {sorted.map((p) => (
          <li
            key={p.page_number}
            className="rounded-[var(--radius-sm)] border border-rule bg-paper p-4"
          >
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Page {p.page_number} of {total}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not optimizable */}
            <img
              src={p.view_url}
              alt={`${label}, page ${p.page_number} of ${total}`}
              className="w-full rounded-[var(--radius-sm)] border border-rule-soft"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
