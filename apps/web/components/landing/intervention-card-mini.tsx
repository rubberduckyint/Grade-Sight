// InterventionCardMini — landing illustration: the small student-
// facing artifact the product produces when a pattern is identified.
// Insight-colored quote border. Ported from
// docs/design/dir-editorial.jsx.

export function InterventionCardMini() {
  return (
    <div className="relative w-[380px] rounded-[var(--radius-sm)] border border-rule bg-paper px-7 py-7">
      <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Intervention · sign errors
      </div>
      <h3 className="font-serif text-2xl font-medium tracking-[-0.015em] text-ink">
        The Negative Check
      </h3>
      <div className="mt-1 font-sans text-sm text-ink-soft">
        Before you move on, ask one thing.
      </div>
      <div className="my-5 border-l-2 border-insight pl-4">
        <p className="font-serif text-xl italic leading-snug text-ink">
          &ldquo;If the number in front was negative, did the sign of everything
          after it flip?&rdquo;
        </p>
      </div>
      <div className="flex gap-5 border-t border-rule-soft pt-4 text-sm text-ink-soft">
        <div>
          <span className="font-semibold text-ink">Print.</span> Tape it to the
          desk.
        </div>
        <div>
          <span className="font-semibold text-ink">Use it for two weeks.</span>
        </div>
      </div>
    </div>
  );
}
