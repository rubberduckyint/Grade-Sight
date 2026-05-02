import type { Klass } from "@/lib/types";
import { ClassRow } from "./class-row";

export function ClassList({ classes }: { classes: Klass[] }) {
  if (classes.length === 0) {
    return (
      <p className="py-12 text-center text-base text-ink-soft">
        No classes match.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
      <table className="w-full text-left">
        <thead className="border-b border-rule-soft bg-paper-soft">
          <tr className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            <th className="py-3 pl-4 pr-4 font-normal">Name</th>
            <th className="py-3 pr-4 font-normal">Subject</th>
            <th className="py-3 pr-4 font-normal">Grade</th>
            <th className="py-3 pr-4 font-normal">Students</th>
            <th className="py-3 pr-4" />
          </tr>
        </thead>
        <tbody>
          {classes.map((k) => <ClassRow key={k.id} klass={k} />)}
        </tbody>
      </table>
    </div>
  );
}
