import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GSLogo } from "@/components/gs-logo";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { TrustBand } from "@/components/trust-band";
import { AssessmentMock } from "@/components/landing/assessment-mock";
import { LongitudinalMini } from "@/components/landing/longitudinal-mini";
import { InterventionCardMini } from "@/components/landing/intervention-card-mini";

const NAV_ANCHORS = [
  { label: "For parents", href: "#for-parents" },
  { label: "For teachers", href: "#for-teachers" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Privacy", href: "#privacy" },
  { label: "Pricing", href: "#pricing" },
];

const CATEGORIES = [
  {
    n: "01",
    k: "Execution",
    t: "Arithmetic slips, sign errors, transcription mistakes. The student knows the method — something fell out along the way.",
  },
  {
    n: "02",
    k: "Concept",
    t: "A rule or relationship that hasn't settled. Recurs across problems that share the same underlying idea.",
  },
  {
    n: "03",
    k: "Strategy",
    t: "The work is correct but the path is fragile — skipped verification, no sanity check, no second route when the first one stalls.",
  },
];

export default function Home() {
  return (
    <>
      {/* 1. Top marketing nav */}
      <nav className="border-b border-rule-soft">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-5 md:px-10">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-ink hover:opacity-80"
          >
            <GSLogo size={22} />
            <span className="font-serif text-xl font-medium tracking-[-0.012em]">
              Grade Sight
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-ink-soft md:flex">
            {NAV_ANCHORS.map((a) => (
              <a key={a.href} href={a.href} className="hover:text-ink">
                {a.label}
              </a>
            ))}
          </div>
          <Link
            href="/sign-in"
            className="text-sm text-ink-soft hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* 2. Hero */}
      <section className="border-b border-rule-soft">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-12 px-6 py-20 md:grid-cols-[1.1fr_1fr] md:gap-18 md:px-10 md:py-28">
          <div>
            <SectionEyebrow>
              A diagnostic tool for secondary math
            </SectionEyebrow>
            <div className="mt-6 max-w-[640px]">
              <SerifHeadline level="display">
                Not just{" "}
                <span className="italic text-ink-soft">what</span> your student
                got wrong.
                <br />
                <span className="text-accent">Why.</span>
              </SerifHeadline>
            </div>
            <p className="mt-9 max-w-[500px] font-serif text-lg font-light leading-snug text-ink-soft">
              Upload a math assessment. Grade Sight reads the work, names the
              pattern behind the errors, and suggests a small, specific thing
              to try next.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/sign-up/parent">Sign up as a parent</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/sign-up/teacher">Sign up as a teacher</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm">
              <Link
                href="/sign-in"
                className="text-accent underline-offset-4 hover:underline"
              >
                Already have an account? Sign in →
              </Link>
            </p>

            {/* 2-audience rail */}
            <div className="mt-16 grid grid-cols-1 border-t border-rule-soft md:grid-cols-2">
              <div
                id="for-parents"
                className="border-rule-soft py-5 pr-6 md:border-r"
              >
                <SectionEyebrow>For parents</SectionEyebrow>
                <p className="mt-2 font-serif text-lg leading-snug text-ink">
                  Understand what&apos;s happening — in plain language, without
                  a math degree.
                </p>
              </div>
              <div id="for-teachers" className="py-5 md:pl-6">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-insight">
                  For teachers
                </span>
                <p className="mt-2 font-serif text-lg leading-snug text-ink">
                  Grade a stack in half the time. Surface patterns across the
                  class.
                </p>
              </div>
            </div>
          </div>

          <div className="relative pt-5 md:justify-self-end">
            <AssessmentMock />
            <p className="mt-6 font-mono text-xs tracking-[0.06em] text-ink-mute">
              Fig. 1 — A diagnosed quiz. Not a score; a conversation.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Editorial pull quote */}
      <section id="how-it-works" className="border-b border-rule-soft">
        <div className="mx-auto max-w-[820px] px-6 py-24 md:px-10 md:py-32">
          <SectionEyebrow className="text-accent">
            What the product does
          </SectionEyebrow>
          <p className="mt-5 font-serif text-3xl font-normal leading-snug tracking-[-0.015em] text-ink">
            Most grading tools stop at{" "}
            <span className="italic text-ink-soft">right</span> or{" "}
            <span className="italic text-ink-soft">wrong</span>. Grade Sight
            names the pattern behind the wrong answers — a sign error when
            distributing negatives, a skipped verification step, a concept
            that hasn&apos;t landed — and suggests one small thing to try.
          </p>
        </div>
      </section>

      {/* 4. Three diagnostic categories */}
      <section className="border-b border-rule-soft">
        <div className="mx-auto max-w-[1200px] px-6 pt-20 pb-10 md:px-10 md:pt-24 md:pb-12">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-14">
            {CATEGORIES.map((c) => (
              <div key={c.n}>
                <div className="font-mono text-xs uppercase tracking-[0.1em] text-ink-mute">
                  {c.n} —
                </div>
                <SerifHeadline
                  level="card"
                  as="h3"
                  className="mt-3 font-medium tracking-[-0.01em]"
                >
                  {c.k}
                </SerifHeadline>
                <p className="mt-3 leading-loose text-ink-soft">{c.t}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 max-w-[640px] font-serif text-sm italic leading-loose text-ink-mute">
            Inside Grade Sight we look at four signals — execution, concept,
            strategy, and how confident your kid is in their answer. We
            grouped strategy + confidence here for clarity.
          </p>
        </div>
      </section>

      {/* 5. Longitudinal tracking */}
      <section className="border-b border-rule-soft">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 py-24 md:grid-cols-[1fr_1.3fr] md:gap-16 md:px-10 md:py-28">
          <div>
            <SectionEyebrow className="text-accent">
              Patterns over time
            </SectionEyebrow>
            <SerifHeadline level="page" className="mt-4">
              One test is a snapshot.
              <br />
              Six tests is a story.
            </SerifHeadline>
            <p className="mt-5 max-w-[420px] leading-loose text-ink-soft">
              Grade Sight tracks the diagnostic pattern across every assessment
              you upload. When an old weakness resolves, you&apos;ll see it.
              When one keeps coming back, you&apos;ll see that too — honestly.
            </p>
          </div>
          <LongitudinalMini />
        </div>
      </section>

      {/* 6. Intervention card preview */}
      <section className="border-b border-rule-soft">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 py-24 md:grid-cols-[1.3fr_1fr] md:gap-16 md:px-10 md:py-28">
          <div className="md:order-1">
            <InterventionCardMini />
          </div>
          <div className="md:order-2">
            <SectionEyebrow className="text-accent">
              What the student gets
            </SectionEyebrow>
            <SerifHeadline level="page" className="mt-4">
              A small card they can keep at their desk.
            </SerifHeadline>
            <p className="mt-5 max-w-[420px] leading-loose text-ink-soft">
              When a pattern is identified, the system suggests a short,
              memorable framework — something a student can carry in their
              head. Print it. Tape it up. Forget it once the habit sticks.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Privacy */}
      <section id="privacy" className="border-b border-rule-soft bg-paper-soft">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-12 px-6 py-24 md:grid-cols-2 md:gap-18 md:px-10 md:py-28">
          <div>
            <SectionEyebrow className="text-accent">On privacy</SectionEyebrow>
            <SerifHeadline level="page" className="mt-4">
              Your student&apos;s work belongs to your student.
            </SerifHeadline>
            <p className="mt-5 max-w-[440px] leading-loose text-ink-soft">
              We store what&apos;s needed to track patterns over time, and
              nothing else. You can see everything we have. You can export it.
              You can delete it — all of it — in one click. No dark patterns.
              No retention loopholes. This page exists because we think it
              should.
            </p>
            {/* TODO: verify this link works once Step 13 builds /settings/privacy */}
            <Link
              href="/settings/privacy"
              className="mt-7 inline-block text-sm text-accent underline underline-offset-4"
            >
              See your data controls →
            </Link>
          </div>
          <div className="font-mono text-sm leading-loose text-ink-soft">
            <div className="mb-3 text-xs uppercase tracking-[0.1em] text-ink-mute">
              What we store
            </div>
            <div>— Student first name (optional)</div>
            <div>— Uploaded assessment images</div>
            <div>— Diagnostic categories per problem</div>
            <div>— Timestamp and subject area</div>
            <div className="mt-7 mb-3 text-xs uppercase tracking-[0.1em] text-ink-mute">
              What we don&apos;t
            </div>
            <div>— School or district affiliation</div>
            <div>— Identifying images of the student</div>
            <div>— Any data used for ad targeting</div>
            <div>— Anything shared with third parties</div>
          </div>
        </div>
      </section>

      {/* 8a. Pricing — honest-money pitch, scroll target for the nav "Pricing" link */}
      <section id="pricing" className="border-b border-rule-soft">
        <div className="mx-auto max-w-[820px] px-6 py-24 text-center md:px-10 md:py-28">
          <SectionEyebrow className="text-accent">Pricing</SectionEyebrow>
          <div className="mt-5">
            <SerifHeadline level="page">$15 per month.</SerifHeadline>
          </div>
          <p className="mt-5 text-lg text-ink-soft">
            Cancel anytime. Your first 7 days are free.
          </p>
        </div>
      </section>

      {/* 8b. Final CTA */}
      <section className="border-b border-rule-soft">
        <div className="mx-auto max-w-[1200px] px-6 py-32 text-center md:px-10">
          <div className="mx-auto max-w-[780px]">
            <SerifHeadline level="greeting">
              One photo. One honest reading of where your student actually is.
            </SerifHeadline>
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/sign-up/parent">Sign up as a parent</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/sign-up/teacher">Sign up as a teacher</Link>
            </Button>
          </div>
          <p className="mt-5 text-sm text-ink-mute">
            No credit card. Two-minute setup.
          </p>
        </div>
      </section>

      {/* TrustBand from Step 03 — required by the brief */}
      <TrustBand />

      {/* 9. Footer */}
      <footer className="border-t border-rule-soft">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-2 px-6 py-8 text-xs text-ink-mute md:flex-row md:items-center md:px-10">
          <span>© 2026 Grade Sight</span>
          <span>
            Built by teachers, parents, and one very patient math tutor.
          </span>
        </div>
      </footer>
    </>
  );
}
