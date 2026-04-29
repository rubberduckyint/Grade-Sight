// AssessmentMock — landing hero visual: a reproduction of diagnosed
// student math work. Demonstrates the product. Uses Caveat for the
// student handwriting + mark color for red-pen marks. Insight color
// borders the diagnostic callout. Ported from
// docs/design/assessment-mock.jsx.
//
// Sizes: math is text-xl (22px), labels are text-xs (13px), callout
// body is text-sm (15px) — all v2 tokens. The canvas's smaller
// 9-12px text bumped to the closest token.

export function AssessmentMock({
  variant = "full",
}: {
  variant?: "full" | "minimal";
}) {
  return (
    <div className="relative h-[480px] w-[380px] max-w-full overflow-hidden rounded-[var(--radius-sm)] border border-rule bg-paper px-6 py-5 font-hand text-xl leading-snug text-ink">
      <div className="mb-4 flex justify-between border-b border-rule-soft pb-2 font-sans text-xs uppercase tracking-[0.1em] text-ink-mute">
        <span>Algebra II · Unit 4 Quiz</span>
        <span>10 / 15</span>
      </div>

      <div className="mb-4">
        <div className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
          1. Solve for x
        </div>
        <div>3(x − 4) = 18</div>
        <div>3x − 12 = 18</div>
        <div>3x = 30</div>
        <div>
          x = 10 <span className="ml-1.5 text-mark">✓</span>
        </div>
      </div>

      <div className="relative mb-4">
        <div className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
          2. Solve for x
        </div>
        <div>−2(x + 5) = 8</div>
        <div>
          −2x{" "}
          <span className="text-mark line-through decoration-mark">+ 10</span>
          <span className="ml-1 text-mark">− 10</span> = 8
        </div>
        <div className="opacity-55">−2x + 10 = 8</div>
        <div className="opacity-55">−2x = −2</div>
        <div className="opacity-55">
          x = 1 <span className="ml-1.5 text-mark">✗</span>
        </div>

        {variant !== "minimal" && (
          <div className="absolute right-[-8px] top-[18px] w-[180px] rotate-[0.3deg] rounded-[var(--radius-xs)] border border-rule border-l-2 border-l-insight bg-paper px-2.5 py-2">
            <div className="mb-1 font-sans text-xs uppercase tracking-[0.1em] text-ink-mute">
              Sign error
            </div>
            <div className="font-serif text-sm leading-snug text-ink">
              Distributed −2 as +10 instead of −10. Third time this month.
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
          3. Factor completely
        </div>
        <div>x² − 9x + 20</div>
        <div>
          (x − 4)(x − 5) <span className="ml-1.5 text-mark">✓</span>
        </div>
      </div>
    </div>
  );
}
