import { firstName } from "@/lib/diagnosis-sentence";
import type { AssessmentDetail } from "@/lib/types";

type AnalysisMode = "auto_grade" | "with_key" | "already_graded";

const STEP_2_LABEL: Record<AnalysisMode, string> = {
  auto_grade: "Reading the work",
  with_key: "Reading against the answer key",
  already_graded: "Reading the marks the teacher made",
};

function indicativeStep(uploadedAt: string): 1 | 2 | 3 | 4 {
  const elapsed = (Date.now() - new Date(uploadedAt).getTime()) / 1000;
  if (elapsed < 5) return 1;
  if (elapsed < 15) return 2;
  if (elapsed < 25) return 3;
  return 4;
}

export function ProcessingCard({
  studentName,
  pages,
  uploadedAt,
  mode,
}: {
  studentName: string;
  pages: AssessmentDetail["pages"];
  uploadedAt: string;
  mode: AnalysisMode;
}) {
  const first = firstName(studentName);
  const current = indicativeStep(uploadedAt);

  const steps = [
    { n: 1 as const, label: "Pages received" },
    { n: 2 as const, label: STEP_2_LABEL[mode] },
    { n: 3 as const, label: `Looking at where ${first} went off` },
    { n: 4 as const, label: "Naming the pattern" },
  ];

  return (
    <section className="my-12">
      <div className="grid grid-cols-[1.4fr_1fr] gap-14 items-center bg-paper-soft border border-rule-soft rounded-[var(--radius-md)] px-14 py-14">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
            Reading the quiz
          </p>
          <h2 className="font-serif text-3xl font-normal text-ink leading-tight tracking-[-0.014em] mt-4 max-w-[34ch]">
            We're working through {first}'s paper. Usually about thirty seconds.
          </h2>
          <p className="font-serif text-lg font-light text-ink-soft leading-[1.55] mt-4 max-w-[40ch]">
            You can close this page. We'll save the result to {first} when it's
            ready, and you can come back any time.
          </p>

          <ol className="mt-7 flex flex-col gap-3">
            {steps.map((s) => {
              const state =
                s.n < current ? "done" : s.n === current ? "doing" : "todo";
              return (
                <li key={s.n} className="flex gap-4 items-center">
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      state === "done"
                        ? "border-accent bg-accent text-paper"
                        : "border-rule"
                    }`}
                  >
                    {state === "done" ? (
                      <span className="text-[9px] font-bold leading-none">
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`font-serif text-base ${
                      state === "doing"
                        ? "text-ink italic"
                        : state === "todo"
                          ? "text-ink-mute"
                          : "text-ink-soft"
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {pages.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {pages.slice(0, 4).map((p) => (
              /* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not optimizable */
              <img
                key={p.page_number}
                src={p.view_url}
                alt={`Page ${p.page_number}`}
                className="aspect-[8.5/11] object-cover bg-paper border border-rule rounded-[var(--radius-xs)]"
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="font-sans text-sm text-ink-mute text-center mt-6">
        Stored encrypted. Delete any time from settings.
      </p>
    </section>
  );
}
