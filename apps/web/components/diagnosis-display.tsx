import { Badge } from "@/components/ui/badge";
import { SectionEyebrow } from "@/components/section-eyebrow";
import type { AssessmentDiagnosis, ProblemObservation } from "@/lib/types";

export interface DiagnosisDisplayProps {
  diagnosis: AssessmentDiagnosis;
}

export function DiagnosisDisplay({ diagnosis }: DiagnosisDisplayProps) {
  return (
    <div className="my-12">
      <SectionEyebrow>
        {diagnosis.total_problems_seen != null && diagnosis.problems.length > 0
          ? `${diagnosis.problems.length} of ${diagnosis.total_problems_seen} problems need review`
          : diagnosis.total_problems_seen != null && diagnosis.problems.length === 0
            ? `All ${diagnosis.total_problems_seen} problems correct`
            : "Diagnostic results"}
      </SectionEyebrow>
      {diagnosis.overall_summary && (
        <p className="mt-3 font-serif text-lg text-ink">
          {diagnosis.overall_summary}
        </p>
      )}
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
        Grade-Sight&apos;s analysis. Verify with your teacher if uncertain.
      </p>

      <ul className="mt-6 space-y-4">
        {diagnosis.problems.map((p) => (
          <ProblemCard key={p.id} problem={p} />
        ))}
      </ul>
    </div>
  );
}

function ProblemCard({ problem }: { problem: ProblemObservation }) {
  return (
    <li className="rounded-[var(--radius-sm)] border border-rule bg-paper p-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Problem {problem.problem_number} · Page {problem.page_number}
        </p>
        {problem.is_correct ? (
          <Badge
            variant="secondary"
            className="font-mono uppercase tracking-[0.12em]"
          >
            ✓ Correct
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-mark text-paper font-mono uppercase tracking-[0.12em]"
          >
            ✗ Wrong
          </Badge>
        )}
      </div>

      <div className="mt-3">
        <p className="text-sm text-ink-soft">Student&apos;s answer</p>
        <p
          className={`mt-1 text-base ${
            problem.is_correct ? "text-ink" : "text-ink line-through"
          }`}
        >
          {problem.student_answer}
        </p>
      </div>

      {!problem.is_correct && (
        <>
          <div className="mt-3">
            <p className="text-sm text-ink-soft">Correct answer</p>
            <p className="mt-1 text-base text-ink">{problem.correct_answer}</p>
          </div>

          {problem.error_pattern_name && (
            <div className="mt-4 flex flex-wrap items-center gap-x-2">
              <Badge
                variant="secondary"
                className="font-mono uppercase tracking-[0.12em]"
              >
                {problem.error_category_slug
                  ? `${problem.error_category_slug} · ${problem.error_pattern_name}`
                  : problem.error_pattern_name}
              </Badge>
            </div>
          )}

          {problem.error_description && (
            <p className="mt-3 text-base text-ink">
              {problem.error_description}
            </p>
          )}

          {problem.solution_steps && (
            <details className="mt-4">
              <summary className="cursor-pointer text-base text-accent hover:underline">
                Show step-by-step solution
              </summary>
              <pre className="mt-3 whitespace-pre-wrap rounded-[var(--radius-sm)] bg-paper-soft p-4 font-serif text-base text-ink">
                {problem.solution_steps}
              </pre>
            </details>
          )}
        </>
      )}
    </li>
  );
}
