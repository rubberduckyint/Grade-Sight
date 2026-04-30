import type {
  AssessmentDiagnosis,
  ProblemObservation,
} from "@/lib/types";

export type Role = "parent" | "teacher";

export type TopSentence =
  | {
      kind: "structured";
      score: string;
      lead: string;
      accentPhrase: string | null;
    }
  | {
      kind: "fallback";
      text: string;
    };

export interface PatternGroup {
  slug: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  problems: ProblemObservation[];
}

export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return fullName;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildTopSentence(
  diagnosis: AssessmentDiagnosis,
  role: Role,
): TopSentence {
  const { problems, total_problems_seen, overall_summary } = diagnosis;

  if (problems.length === 0) {
    const text =
      overall_summary && overall_summary.trim() !== ""
        ? overall_summary
        : "Diagnostic complete.";
    return { kind: "fallback", text };
  }

  const right = problems.filter((p) => p.is_correct).length;
  const wrong = problems.filter((p) => !p.is_correct);
  const seen = total_problems_seen ?? problems.length;
  const score = `${right} of ${seen}`;

  // All correct
  if (wrong.length === 0) {
    return {
      kind: "structured",
      score,
      lead: "No mistakes worth flagging.",
      accentPhrase: null,
    };
  }

  // Single wrong
  if (wrong.length === 1) {
    const only = wrong[0]!;
    if (only.error_pattern_name) {
      return {
        kind: "structured",
        score,
        lead: "The miss is",
        accentPhrase: only.error_pattern_name,
      };
    }
    return {
      kind: "structured",
      score,
      lead: "One missed problem.",
      accentPhrase: null,
    };
  }

  // Compute dominant pattern (only over non-null slugs)
  const slugCounts = new Map<string, { count: number; firstOccurrence: number; name: string | null }>();
  for (const p of wrong) {
    if (!p.error_pattern_slug) continue;
    const existing = slugCounts.get(p.error_pattern_slug);
    if (existing) {
      existing.count += 1;
    } else {
      slugCounts.set(p.error_pattern_slug, {
        count: 1,
        firstOccurrence: p.problem_number,
        name: p.error_pattern_name,
      });
    }
  }

  let dominantSlug: string | null = null;
  let dominantInfo: { count: number; firstOccurrence: number; name: string | null } | null = null;
  for (const [slug, info] of slugCounts) {
    if (info.count < 2) continue;
    if (
      dominantInfo === null ||
      info.count > dominantInfo.count ||
      (info.count === dominantInfo.count && info.firstOccurrence < dominantInfo.firstOccurrence)
    ) {
      dominantSlug = slug;
      dominantInfo = info;
    }
  }

  if (dominantInfo && dominantSlug !== null) {
    const wrongWord = role === "teacher" ? "wrong" : "wrong answers";
    return {
      kind: "structured",
      score,
      lead: `${dominantInfo.count} of ${wrong.length} ${wrongWord} share the same pattern:`,
      accentPhrase: dominantInfo.name ?? null,
    };
  }

  // No dominant pattern
  return {
    kind: "structured",
    score,
    lead: "Each missed problem hit a different pattern — see below.",
    accentPhrase: null,
  };
}

export function groupProblemsByPattern(
  problems: ProblemObservation[],
): PatternGroup[] {
  const wrong = problems.filter((p) => !p.is_correct);
  if (wrong.length === 0) return [];

  const buckets = new Map<string, PatternGroup>();
  const otherBucket: PatternGroup = {
    slug: null,
    category: null,
    name: null,
    description: null,
    problems: [],
  };

  for (const p of wrong) {
    if (!p.error_pattern_slug) {
      otherBucket.problems.push(p);
      if (otherBucket.description === null && p.error_description) {
        otherBucket.description = p.error_description;
      }
      continue;
    }
    const existing = buckets.get(p.error_pattern_slug);
    if (existing) {
      existing.problems.push(p);
      continue;
    }
    buckets.set(p.error_pattern_slug, {
      slug: p.error_pattern_slug,
      category: p.error_category_slug,
      name: p.error_pattern_name,
      description: p.error_description,
      problems: [p],
    });
  }

  const namedGroups = Array.from(buckets.values()).sort(
    (a, b) => b.problems.length - a.problems.length,
  );

  if (otherBucket.problems.length > 0) {
    return [...namedGroups, otherBucket];
  }
  return namedGroups;
}
