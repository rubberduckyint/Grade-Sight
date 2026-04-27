import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionEyebrow } from "@/components/section-eyebrow";
import type { AssessmentListItem } from "@/lib/api";

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
            <li key={a.id} className="flex items-center justify-between py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base text-ink">{a.original_filename}</p>
                <p className="text-sm text-ink-soft">
                  {a.student_name} · {timeAgo(a.uploaded_at)}
                </p>
              </div>
              <Badge variant="secondary" className="font-mono uppercase tracking-[0.12em]">
                {STATUS_LABEL[a.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
