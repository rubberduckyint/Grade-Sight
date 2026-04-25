import { SectionEyebrow } from "./section-eyebrow";

const COMMITMENTS = [
  "We never sell student data.",
  "No advertising or behavioral profiling of students.",
  "All data stored in US regions; deleted within 30 days on request.",
  "Privacy reviewed by edtech counsel; SDPC NDPA signable.",
] as const;

export function TrustBand() {
  return (
    <section className="border-t border-rule-soft bg-paper-soft">
      <div className="mx-auto max-w-[1000px] px-6 py-16 md:px-10">
        <SectionEyebrow>Privacy commitments</SectionEyebrow>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {COMMITMENTS.map((line) => (
            <li
              key={line}
              className="border-l-2 border-accent pl-4 text-base text-ink-soft"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
