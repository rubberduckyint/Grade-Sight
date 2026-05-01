import Link from "next/link";

import { SerifHeadline } from "@/components/serif-headline";
import type { StudentSummary } from "@/lib/types";

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function StudentHeader({ student }: { student: StudentSummary }) {
  const grade = student.grade_level !== null ? `${student.grade_level}th grade · ` : "";
  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        <span>Students</span>
        <span aria-hidden="true"> · </span>
        <span className="text-ink">{student.full_name}</span>
      </p>

      <div className="mt-6 flex items-end justify-between gap-8">
        <div>
          <SerifHeadline level="page" as="h1">
            {student.full_name}
          </SerifHeadline>
          <p className="mt-3 font-sans text-base text-ink-soft">
            {grade}added {formatAbsoluteDate(student.added_at)}
          </p>
        </div>
        <Link
          href="/upload"
          className="font-mono text-xs uppercase tracking-[0.14em] text-accent hover:underline shrink-0"
        >
          Upload new quiz ›
        </Link>
      </div>
    </header>
  );
}
