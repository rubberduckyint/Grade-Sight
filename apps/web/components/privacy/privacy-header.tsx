// apps/web/components/privacy/privacy-header.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export function PrivacyHeader() {
  return (
    <header className="mb-14">
      <SectionEyebrow>Settings &middot; Privacy &amp; data</SectionEyebrow>
      <div className="mt-4">
        <SerifHeadline level="page" as="h1">What we keep, and for how long.</SerifHeadline>
      </div>
      <p className="mt-3 max-w-[720px] font-serif text-xl font-light text-ink-soft leading-relaxed">
        Plain English. Edit anything below at any time. Deleting a quiz removes
        it from our servers within 24 hours.
      </p>
    </header>
  );
}
