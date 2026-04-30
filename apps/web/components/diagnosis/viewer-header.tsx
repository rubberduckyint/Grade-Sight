import Link from "next/link";

import { SerifHeadline } from "@/components/serif-headline";
import type { AnswerKeyDetail, AssessmentDetail } from "@/lib/types";

export function ViewerHeader({
  detail,
  answerKey,
}: {
  detail: AssessmentDetail;
  answerKey: AnswerKeyDetail;
}) {
  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        <span>Assessments</span>
        <span aria-hidden="true"> · </span>
        <span>{detail.student_name}</span>
        <span aria-hidden="true"> · </span>
        <span className="text-ink">Side-by-side</span>
      </p>

      <div className="mt-6 flex items-end justify-between gap-8">
        <SerifHeadline level="page" as="h1">
          {detail.student_name} · {answerKey.name}
        </SerifHeadline>
        <Link
          href={`/assessments/${detail.id}`}
          className="font-mono text-xs uppercase tracking-[0.14em] text-accent hover:underline shrink-0"
        >
          Close viewer ›
        </Link>
      </div>
    </header>
  );
}
