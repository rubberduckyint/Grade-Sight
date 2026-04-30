import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { Role } from "@/lib/diagnosis-sentence";
import type { ErrorPattern, ProblemObservation } from "@/lib/types";

export function ReviewedSection({
  problems,
  assessmentId,
  role,
  errorPatterns,
}: {
  problems: ProblemObservation[];
  assessmentId: string;
  role: Role;
  errorPatterns: ErrorPattern[];
}) {
  const reviewed = problems.filter(
    (p) => p.review !== null && p.is_correct,
  );
  if (reviewed.length === 0) return null;

  return (
    <section
      aria-label="Reviewed by teacher"
      className="border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden"
    >
      <header className="bg-paper-soft px-8 py-6 border-b border-rule-soft">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
          Reviewed · marked correct
        </p>
        <p className="font-serif text-base text-ink-soft mt-2">
          Reviewed by teacher
        </p>
      </header>
      <div>
        {reviewed.map((p) => (
          <ProblemRow
            key={p.id}
            problem={p}
            assessmentId={assessmentId}
            role={role}
            errorPatterns={errorPatterns}
            context="reviewed-section"
          />
        ))}
      </div>
    </section>
  );
}
