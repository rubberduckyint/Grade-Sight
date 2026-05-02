// apps/web/components/archive/archive-header.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export function ArchiveHeader() {
  return (
    <header className="mb-8">
      <SectionEyebrow>Archive</SectionEyebrow>
      <div className="mt-3">
        <SerifHeadline level="page" as="h1">Assessments</SerifHeadline>
      </div>
      <p className="mt-2 text-base text-ink-soft">
        Everything you&apos;ve uploaded, newest first.
      </p>
    </header>
  );
}
