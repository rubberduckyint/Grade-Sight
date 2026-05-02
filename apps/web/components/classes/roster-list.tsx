import type { ClassRosterMember } from "@/lib/types";
import { RemoveStudentButton } from "./remove-student-button";

export function RosterList({
  classId,
  roster,
  archived,
}: {
  classId: string;
  roster: ClassRosterMember[];
  archived: boolean;
}) {
  if (roster.length === 0) {
    return (
      <p className="py-8 text-base text-ink-soft">No students yet — add your first.</p>
    );
  }
  return (
    <ul className="divide-y divide-rule-soft border-y border-rule-soft">
      {roster.map((m) => (
        <li key={m.id} className="flex items-baseline justify-between gap-4 py-3">
          <span className="font-serif text-base text-ink">{m.student_name}</span>
          <span className="flex items-baseline gap-4">
            {m.student_grade_level != null && (
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                Grade {m.student_grade_level}
              </span>
            )}
            {!archived && (
              <RemoveStudentButton
                classId={classId}
                studentId={m.student_id}
                studentName={m.student_name}
              />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
