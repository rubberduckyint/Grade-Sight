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
          const reviewed = p.review !== null;
          const wrong = !p.is_correct;
          const label = reviewed
            ? `Problem ${p.problem_number}: reviewed by teacher`
            : `Problem ${p.problem_number}: ${wrong ? "incorrect" : "correct"}`;

          let containerClass: string;
          let glyphClass: string;
          let glyph: string;

          if (reviewed) {
            containerClass = "border-accent bg-accent-soft hover:bg-[oklch(0.95_0.04_252)] cursor-pointer";
            glyphClass = "text-accent";
            glyph = "✎";
          } else if (wrong) {
            containerClass = "border-insight bg-insight-soft hover:bg-[oklch(0.97_0.04_72)] cursor-pointer";
            glyphClass = "text-insight";
            glyph = "✗";
          } else {
            containerClass = "border-rule bg-paper";
            glyphClass = "text-ink";
            glyph = "✓";
          }

          return (
            <li key={p.id}>
              <a
                href={(reviewed || wrong) ? `#problem-${p.problem_number}` : undefined}
                aria-label={label}
                className={`flex flex-col items-center justify-center aspect-square rounded-[var(--radius-xs)] border ${containerClass}`}
              >
                <span className="font-mono text-xs text-ink-mute" aria-hidden="true">
                  #{p.problem_number}
                </span>
                <span className={`font-serif text-sm mt-0.5 ${glyphClass}`} aria-hidden="true">
                  {glyph}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
