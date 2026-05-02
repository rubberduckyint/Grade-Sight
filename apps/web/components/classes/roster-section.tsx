import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { AddStudentsButton } from "./add-students-button";
import { RosterList } from "./roster-list";
import type { ClassDetail, Student } from "@/lib/types";

export function RosterSection({
  klass,
  candidateStudents,
}: {
  klass: ClassDetail;
  candidateStudents: Student[];
}) {
  return (
    <section className="mt-12">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <SectionEyebrow>Roster</SectionEyebrow>
          <div className="mt-3">
            <SerifHeadline level="section" as="h2">
              {klass.roster.length} {klass.roster.length === 1 ? "student" : "students"}
            </SerifHeadline>
          </div>
        </div>
        {!klass.archived && (
          <AddStudentsButton classId={klass.id} candidates={candidateStudents} />
        )}
      </header>
      <RosterList classId={klass.id} roster={klass.roster} archived={klass.archived} />
    </section>
  );
}
