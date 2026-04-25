import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { SerifHeadline } from "@/components/serif-headline";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { TrustBand } from "@/components/trust-band";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <PageContainer className="md:py-32">
        <SectionEyebrow>Diagnostic grading · secondary math</SectionEyebrow>
        <div className="mt-8 max-w-[820px]">
          <SerifHeadline level="display">
            Not just what. <span className="italic text-accent">Why.</span>
          </SerifHeadline>
        </div>
        <p className="mt-10 max-w-[640px] font-serif text-lg leading-snug text-ink-soft">
          Grade Sight reads a photo of your student&apos;s quiz and tells you
          which kind of mistake they made — conceptual, execution, verification,
          or strategy — so the next conversation is about the right thing.
        </p>
        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/sign-up/teacher">Sign up as a teacher</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/sign-up/parent">Sign up as a parent</Link>
          </Button>
          <Button asChild variant="link">
            <Link href="/sign-in">Already have an account? Sign in.</Link>
          </Button>
        </div>
      </PageContainer>
      <TrustBand />
    </>
  );
}
