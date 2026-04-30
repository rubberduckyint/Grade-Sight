import { firstName, type Role, type TopSentence as TopSentenceShape } from "@/lib/diagnosis-sentence";

const EYEBROW: Record<Role, string> = {
  parent: "WHAT THIS QUIZ TELLS US",
  teacher: "WHAT YOU'RE LOOKING AT",
};

export function TopSentence({
  studentName,
  sentence,
  role,
}: {
  studentName: string;
  sentence: TopSentenceShape;
  role: Role;
}) {
  return (
    <section className="border border-rule-soft border-l-[3px] border-l-accent rounded-[var(--radius-md)] bg-paper-soft px-10 py-9">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        {EYEBROW[role]}
      </p>
      {sentence.kind === "structured" ? (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.3] tracking-[-0.014em] mt-3 max-w-[60ch]">
          {firstName(studentName)} got{" "}
          <strong className="font-medium">{sentence.score}</strong>.{" "}
          {sentence.lead}
          {sentence.accentPhrase ? (
            <>
              {" "}
              <span className="text-accent">{sentence.accentPhrase}.</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.3] tracking-[-0.014em] mt-3 max-w-[60ch]">
          {sentence.text}
        </p>
      )}
    </section>
  );
}
