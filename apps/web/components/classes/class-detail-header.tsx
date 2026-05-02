import Link from "next/link";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { EditClassButton } from "./edit-class-button";
import { ArchiveClassButton } from "./archive-class-button";
import { UnarchiveClassButton } from "./unarchive-class-button";
import type { ClassDetail } from "@/lib/types";

export function ClassDetailHeader({ klass }: { klass: ClassDetail }) {
  const subhead = [klass.subject, klass.grade_level && `Grade ${klass.grade_level}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Link
        href="/classes"
        className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-ink"
      >
        ← Classes
      </Link>
      <header className="mt-6 mb-10 flex items-end justify-between">
        <div>
          <SectionEyebrow>{klass.archived ? "Class · Archived" : "Class"}</SectionEyebrow>
          <div className="mt-3">
            <SerifHeadline level="page" as="h1">{klass.name}</SerifHeadline>
          </div>
          {subhead && (
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-mute">
              {subhead}
            </p>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          {klass.archived ? (
            <UnarchiveClassButton classId={klass.id} />
          ) : (
            <>
              <EditClassButton klass={{ ...klass, student_count: klass.roster.length }} />
              <ArchiveClassButton classId={klass.id} />
            </>
          )}
        </div>
      </header>
    </>
  );
}
