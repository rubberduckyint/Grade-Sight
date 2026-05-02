export function WhyKeyLibraryNote() {
  return (
    <section className="mt-14 grid gap-12 border-t border-rule-soft pt-8 md:grid-cols-[1fr_2fr]">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Why a key library
      </div>
      <p className="font-serif text-lg font-light leading-relaxed text-ink-soft">
        Without a key, Grade Sight reads what the teacher wrote. With a key,
        it can grade fresh, find subtler errors, and give parents a real
        &ldquo;why&rdquo; — not just &ldquo;what was marked.&rdquo;{" "}
        <span className="text-ink">Most teachers upload one key per quiz; we use it across every section.</span>
      </p>
    </section>
  );
}
