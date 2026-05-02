// apps/web/components/privacy/what-we-keep-block.tsx
import { WhatWeKeepSection } from "./what-we-keep-section";

const SECTIONS = [
  {
    eyebrow: "WHAT WE STORE",
    title: "Quiz photos, the diagnosis, your child’s name.",
    body: "Photos are encrypted. The diagnosis (what we found, what the pattern was) is plain JSON. Your child’s name lives only on your account — we don’t share it with anyone.",
  },
  {
    eyebrow: "WHAT WE NEVER STORE",
    title: "Faces. School names. Anything not on the quiz.",
    body: "If a photo includes a face or a school logo by accident, our processor blurs it before storing. We don’t ask for or keep school identifiers.",
  },
  {
    eyebrow: "HOW LONG",
    title: "30 days by default. You can shorten it.",
    body: "After 30 days the photos auto-delete. The diagnosis (text only) stays in your history so longitudinal tracking works — unless you delete that too.",
  },
  {
    eyebrow: "AI TRAINING",
    title: "Off. We don’t train on your child’s work.",
    body: "Period. This is enforced at the database level, not a setting we can flip.",
  },
] as const;

export function WhatWeKeepBlock() {
  return (
    <section>
      {SECTIONS.map((s, i) => (
        <WhatWeKeepSection
          key={s.eyebrow}
          eyebrow={s.eyebrow}
          title={s.title}
          body={s.body}
          divider={i < SECTIONS.length - 1}
        />
      ))}
    </section>
  );
}
