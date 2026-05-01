import type { BiographySentence as BiographySentenceShape } from "@/lib/types";

export function BiographySentence({ sentence }: { sentence: BiographySentenceShape }) {
  return (
    <section className="border border-rule-soft border-l-[3px] border-l-accent rounded-[var(--radius-md)] bg-paper-soft px-9 py-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        {sentence.eyebrow}
      </p>
      {sentence.kind === "structured" ? (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.35] tracking-[-0.012em] mt-4 max-w-[70ch]">
          {sentence.lead}
          {sentence.accent ? (
            <>
              {" "}
              <span className="text-ink-soft">{sentence.accent}</span>
            </>
          ) : null}
          {sentence.coda ? (
            <>
              {" "}
              <span className="text-accent">{sentence.coda}</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.35] tracking-[-0.012em] mt-4 max-w-[70ch]">
          {sentence.text}
        </p>
      )}
    </section>
  );
}
