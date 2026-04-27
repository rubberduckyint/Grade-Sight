import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { SectionEyebrow } from "@/components/section-eyebrow";
import type { AssessmentListItem } from "@/lib/types";

const STATUS_LABEL: Record<AssessmentListItem["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface RecentAssessmentsListProps {
  assessments: AssessmentListItem[];
}

export function RecentAssessmentsList({ assessments }: RecentAssessmentsListProps) {
  return (
    <Card className="border-rule bg-paper shadow-none">
      <CardContent className="p-6">
        <SectionEyebrow>Recent assessments</SectionEyebrow>
        <ul className="mt-4 divide-y divide-rule-soft">
          {assessments.map((a) => (
            <li key={a.id} className="flex items-center gap-4 py-3">
              <Link
                href={`/assessments/${a.id}`}
                className="flex flex-1 items-center gap-4"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL, expires hourly */}
                <img
                  src={a.first_page_thumbnail_url}
                  alt={`First page of ${a.student_name}'s assessment`}
                  className="size-16 shrink-0 rounded-[var(--radius-sm)] border border-rule-soft object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base text-ink">{a.student_name}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                    {a.page_count}{" "}
                    {a.page_count === 1 ? "page" : "pages"} · {timeAgo(a.uploaded_at)}
                  </p>
                </div>
              </Link>
              <Badge
                variant="secondary"
                className="font-mono uppercase tracking-[0.12em]"
              >
                {STATUS_LABEL[a.status]}
              </Badge>
              <DeleteAssessmentButton id={a.id} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
