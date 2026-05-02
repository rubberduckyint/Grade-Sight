import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { NewClassButton } from "./new-class-button";
import { ArchivedToggle } from "./archived-toggle";

export function ClassListHeader({
  hasArchived,
  includeArchived,
}: {
  hasArchived: boolean;
  includeArchived: boolean;
}) {
  return (
    <header className="mb-10 flex items-end justify-between">
      <div>
        <SectionEyebrow>Roster</SectionEyebrow>
        <div className="mt-3">
          <SerifHeadline level="page" as="h1">Classes</SerifHeadline>
        </div>
        <p className="mt-2 text-base text-ink-soft max-w-[640px]">
          Group your students into classes — Algebra 1 4th period, etc.
        </p>
      </div>
      <div className="flex items-baseline gap-5">
        {hasArchived && <ArchivedToggle includeArchived={includeArchived} />}
        <NewClassButton />
      </div>
    </header>
  );
}
