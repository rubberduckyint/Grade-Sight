import type { ProblemObservation } from "@/lib/types";

export function ProblemGrid({ problems }: { problems: ProblemObservation[] }) {
  if (problems.length === 0) return null;

  // Sort by problem_number ascending so the grid reads left-to-right in order
  const sorted = [...problems].sort((a, b) => a.problem_number - b.problem_number);

  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Everything else
      </p>
      <p className="font-sans text-base text-ink-soft mt-2 max-w-[60ch]">
        Tap an amber square to jump to the row above.
      </p>
      <ul
        role="list"
        className="grid grid-cols-9 gap-2 mt-5"
      >
        {sorted.map((p) => {
          const wrong = !p.is_correct;
          const label = `Problem ${p.problem_number}: ${wrong ? "incorrect" : "correct"}`;
          return (
            <li key={p.id}>
              <a
                href={wrong ? `#problem-${p.problem_number}` : undefined}
                aria-label={label}
                className={`flex flex-col items-center justify-center aspect-square rounded-[var(--radius-xs)] border ${
                  wrong
                    ? "border-insight bg-insight-soft hover:bg-[oklch(0.97_0.04_72)] cursor-pointer"
                    : "border-rule bg-paper"
                }`}
              >
                <span className="font-mono text-xs text-ink-mute" aria-hidden="true">
                  #{p.problem_number}
                </span>
                <span
                  className={`font-serif text-sm mt-0.5 ${wrong ? "text-insight" : "text-ink"}`}
                  aria-hidden="true"
                >
                  {wrong ? "✗" : "✓"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
