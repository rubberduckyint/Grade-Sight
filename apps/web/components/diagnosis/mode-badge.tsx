import type { AssessmentDiagnosis } from "@/lib/types";

const LABELS: Record<AssessmentDiagnosis["analysis_mode"], string> = {
  auto_grade: "AUTO-GRADED",
  with_key: "GRADED WITH KEY",
  already_graded: "READING THE TEACHER'S MARKS",
};

export function ModeBadge({
  mode,
}: {
  mode: AssessmentDiagnosis["analysis_mode"];
}) {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
      {LABELS[mode]}
    </span>
  );
}
