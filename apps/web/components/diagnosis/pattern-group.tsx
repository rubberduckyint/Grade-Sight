import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { PatternGroup as PatternGroupShape } from "@/lib/diagnosis-sentence";

export function PatternGroup({
  group,
  totalWrong,
  emphasis,
}: {
  group: PatternGroupShape;
  totalWrong: number;
  emphasis: "primary" | "secondary";
}) {
  const isOther = group.slug === null;
  const count = group.problems.length;
  const isOneOff = !isOther && count === 1;

  let eyebrow: string;
  if (isOther) {
    eyebrow = `OTHER · ${count} OF ${totalWrong} WRONG`;
  } else if (isOneOff) {
    eyebrow = `${(group.category ?? "PATTERN").toUpperCase()} · ONE-OFF`;
  } else {
    eyebrow = `${(group.category ?? "PATTERN").toUpperCase()} · ${count} OF ${totalWrong} WRONG`;
  }

  const headerBg = emphasis === "primary" ? "bg-paper-soft" : "bg-paper";
  const eyebrowColor = emphasis === "primary" ? "text-accent" : "text-ink-mute";

  return (
    <section className="border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden">
      <header className={`${headerBg} px-8 py-6 border-b border-rule-soft flex items-baseline justify-between gap-6`}>
        <div>
          <p className={`font-mono text-xs uppercase tracking-[0.14em] ${eyebrowColor}`}>
            {eyebrow}
          </p>
          {group.name ? (
            <h3 className="font-serif text-xl font-medium text-ink mt-2 tracking-[-0.012em]">
              {group.name}
            </h3>
          ) : (
            <h3 className="font-serif text-xl font-medium text-ink mt-2">
              Unclassified
            </h3>
          )}
          {group.description ? (
            <p className="font-serif text-lg text-ink-soft leading-[1.5] mt-2 max-w-[60ch] line-clamp-3">
              {group.description}
            </p>
          ) : null}
        </div>
        <div aria-hidden="true" className="font-serif text-3xl font-normal text-ink shrink-0">
          {count}
        </div>
      </header>
      <div>
        {group.problems.map((p) => (
          <ProblemRow key={p.id} problem={p} />
        ))}
      </div>
    </section>
  );
}
