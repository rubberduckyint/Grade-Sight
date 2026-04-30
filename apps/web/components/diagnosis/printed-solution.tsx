export function PrintedSolution({ steps }: { steps: string }) {
  const lines = steps
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  return (
    <ol className="font-serif text-base text-ink leading-[1.55]">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-3 py-1">
          <span className="font-mono text-xs text-ink-mute pt-1.5 min-w-[1.25rem]">
            {i + 1}.
          </span>
          <span className="whitespace-pre-wrap">{line}</span>
        </li>
      ))}
    </ol>
  );
}
