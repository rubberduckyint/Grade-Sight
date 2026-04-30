import { HandwrittenWork } from "@/components/diagnosis/handwritten-work";
import { PrintedSolution } from "@/components/diagnosis/printed-solution";
import type { ProblemObservation } from "@/lib/types";

function workLines(answer: string): string[] {
  if (!answer) return [""];
  return answer.split(/\r?\n/);
}

export function ProblemRow({ problem }: { problem: ProblemObservation }) {
  const hasSteps =
    !!problem.solution_steps && problem.solution_steps.trim() !== "";

  return (
    <article
      id={`problem-${problem.problem_number}`}
      className="px-8 py-6 border-t border-rule-soft first:border-t-0"
    >
      <div className="grid grid-cols-[60px_1.4fr_1fr_1fr] gap-5 items-start">
        <div className="font-serif italic text-2xl text-ink-mute">
          #{problem.problem_number}
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            Their answer
          </p>
          <div className="mt-1">
            <HandwrittenWork lines={workLines(problem.student_answer)} />
          </div>
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            What it should be
          </p>
          <p className="font-serif text-xl text-ink mt-1">
            {problem.correct_answer}
          </p>
        </div>

        <div>
          {!problem.is_correct && problem.error_description ? (
            <>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
                Why
              </p>
              <p className="font-sans italic text-sm text-insight mt-1">
                ↑ {problem.error_description}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {hasSteps ? (
        <details className="mt-4 ml-[80px]">
          <summary className="font-mono text-xs uppercase tracking-[0.1em] text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-block">
            Steps ›
          </summary>
          <div className="mt-3">
            <PrintedSolution steps={problem.solution_steps as string} />
          </div>
        </details>
      ) : null}
    </article>
  );
}
