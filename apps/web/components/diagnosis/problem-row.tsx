"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditPanel } from "@/components/diagnosis/edit-panel";
import { HandwrittenWork } from "@/components/diagnosis/handwritten-work";
import { PrintedSolution } from "@/components/diagnosis/printed-solution";
import { createReview, deleteReview, updateReview } from "@/lib/actions/reviews";
import type { Role } from "@/lib/diagnosis-sentence";
import { notify } from "@/lib/notify";
import type { ErrorPattern, ProblemObservation } from "@/lib/types";

function workLines(answer: string): string[] {
  if (!answer) return [""];
  return answer.split(/\r?\n/);
}

export interface ProblemRowProps {
  problem: ProblemObservation;
  assessmentId?: string;
  role?: Role;
  errorPatterns?: ErrorPattern[];
  context?: "pattern-group" | "reviewed-section";
}

type Mode = "view" | "editing" | "saving";

export function ProblemRow({
  problem,
  assessmentId = "",
  role = "parent",
  errorPatterns = [],
  context = "pattern-group",
}: ProblemRowProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [, startTransition] = useTransition();

  const hasReview = problem.review !== null;
  const isWrong = !problem.is_correct;
  const isEditable = role === "teacher" && (isWrong || hasReview);
  const hasSteps = !!problem.solution_steps && problem.solution_steps.trim() !== "";
  const isReviewedSection = context === "reviewed-section";

  const initialPatternId = problem.review?.override_pattern_id ?? null;
  const initialMarkedCorrect = problem.review?.marked_correct ?? false;

  function handleSave(payload: { override_pattern_id: string | null; marked_correct: boolean }): void {
    setMode("saving");
    startTransition(async () => {
      try {
        if (problem.review) {
          await updateReview(assessmentId, problem.review.id, payload);
        } else {
          await createReview(assessmentId, {
            problem_number: problem.problem_number,
            ...payload,
          });
        }
        notify.success("Review saved");
        setMode("view");
        router.refresh();
      } catch (err) {
        notify.error("Couldn’t save review", {
          description: err instanceof Error ? err.message : undefined,
        });
        setMode("editing");
      }
    });
  }

  function handleDelete(): void {
    if (!problem.review) return;
    setMode("saving");
    startTransition(async () => {
      try {
        await deleteReview(assessmentId, problem.review!.id);
        notify.success("Review removed");
        setMode("view");
        router.refresh();
      } catch (err) {
        notify.error("Couldn’t remove review", {
          description: err instanceof Error ? err.message : undefined,
        });
        setMode("editing");
      }
    });
  }

  const isEditing = mode === "editing" || mode === "saving";
  const rowBg = isEditing ? "bg-accent-soft" : "";

  return (
    <article
      id={`problem-${problem.problem_number}`}
      className={`px-8 py-6 border-t border-rule-soft first:border-t-0 ${rowBg}`}
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

        {isEditing ? (
          <div className="col-span-2">
            <EditPanel
              initialPatternId={initialPatternId}
              initialMarkedCorrect={initialMarkedCorrect}
              patterns={errorPatterns}
              hasExistingReview={hasReview}
              isSaving={mode === "saving"}
              onSave={handleSave}
              onCancel={() => setMode("view")}
              onDelete={hasReview ? handleDelete : undefined}
            />
          </div>
        ) : (
          <>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
                What it should be
              </p>
              <p className="font-serif text-xl text-ink mt-1">
                {isReviewedSection ? "—" : problem.correct_answer}
              </p>
            </div>

            <div>
              {!problem.is_correct && problem.error_description ? (
                <>
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
                    Why
                  </p>
                  <p className="font-sans italic text-sm text-insight mt-1">
                    {"↑"} {problem.error_description}
                  </p>
                </>
              ) : null}
              {isEditable ? (
                <button
                  type="button"
                  onClick={() => setMode("editing")}
                  className="font-mono text-xs uppercase tracking-[0.1em] text-accent mt-3 inline-block cursor-pointer"
                >
                  Edit {"›"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {hasSteps && !isEditing ? (
        <details className="mt-4 ml-[80px]">
          <summary className="font-mono text-xs uppercase tracking-[0.1em] text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-block">
            Steps {"›"}
          </summary>
          <div className="mt-3">
            <PrintedSolution steps={problem.solution_steps as string} />
          </div>
        </details>
      ) : null}
    </article>
  );
}
