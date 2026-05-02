import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createCheckoutSession,
  fetchAnswerKeys,
  fetchAssessments,
  fetchEntitlement,
  fetchMe,
  fetchPrices,
  fetchStudents,
} from "@/lib/api";
import type { PriceInfo } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { TrialBanner } from "@/components/trial-banner";
import { RecentAssessmentsList } from "@/components/recent-assessments-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PARENT_TABS, TEACHER_TABS } from "@/lib/nav";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

function daysUntil(iso: string, now: number): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - now) / (1000 * 60 * 60 * 24)),
  );
}

function formatDayWelcome(now: Date): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    now,
  );
  return `${weekday} · welcome`;
}

function formatDayLong(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

function formatPriceLabel(price: PriceInfo): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price.unit_amount / 100);
  return `${amount}/${price.interval}`;
}

export default async function DashboardPage() {
  const [user, entitlement, assessments, students, keys, prices] = await Promise.all([
    fetchMe(),
    fetchEntitlement(),
    fetchAssessments({ limit: 10 }),
    fetchStudents(),
    fetchAnswerKeys(),
    fetchPrices(),
  ]);
  if (!user) redirect("/sign-in");

  const role = user.role === "teacher" ? "teacher" : "parent";
  const planKey = role === "teacher" ? "teacher_monthly" : "parent_monthly";
  const priceLabel = formatPriceLabel(prices.prices[planKey]);
  const tabs = role === "teacher" ? TEACHER_TABS : PARENT_TABS;
  const uploadLabel = role === "parent" ? "Upload" : "Upload assessment";
  const firstName =
    user.first_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email;

  const now = new Date();
  const nowMs = now.getTime();
  const daysRemaining =
    entitlement?.trial_ends_at != null
      ? daysUntil(entitlement.trial_ends_at, nowMs)
      : null;
  const showBanner =
    entitlement?.status === "trialing" &&
    daysRemaining !== null &&
    daysRemaining <= 7;

  const isFirstRun = assessments.assessments.length === 0;

  return (
    <AppShell
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={tabs}
      activeHref="/dashboard"
      uploadHref="/upload"
      uploadLabel={uploadLabel}
    >
      <PageContainer>
        {showBanner && daysRemaining !== null && (
          <div className="mb-10">
            <TrialBanner
              daysRemaining={daysRemaining}
              role={role}
              priceLabel={priceLabel}
              onAddCard={handleCheckout}
            />
          </div>
        )}
        {isFirstRun ? (
          role === "parent" ? (
            <ParentFirstRun
              now={now}
              userName={firstName}
              hasStudents={students.length > 0}
            />
          ) : (
            <TeacherFirstRun
              now={now}
              userName={firstName}
              hasKeys={keys.length > 0}
              hasStudents={students.length > 0}
            />
          )
        ) : (
          <PopulatedDashboard
            now={now}
            userName={firstName}
            assessments={assessments.assessments}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}

// ─── Populated state — simple version. Insight cards deferred to a
// future step (Step 11+) when pattern aggregation APIs land.

function PopulatedDashboard({
  now,
  userName,
  assessments,
}: {
  now: Date;
  userName: string;
  assessments: import("@/lib/types").AssessmentListItem[];
}) {
  return (
    <>
      <SectionEyebrow>{formatDayLong(now)}</SectionEyebrow>
      <div className="mt-3">
        <SerifHeadline level="greeting">
          Welcome back, {userName}.
        </SerifHeadline>
      </div>
      <div className="mt-12">
        <SectionEyebrow>Recent</SectionEyebrow>
        <div className="mt-4">
          <RecentAssessmentsList assessments={assessments} />
        </div>
      </div>
    </>
  );
}

// ─── First-run states — empty/onboarding views per Foundation v2.

function ParentFirstRun({
  now,
  userName,
  hasStudents,
}: {
  now: Date;
  userName: string;
  hasStudents: boolean;
}) {
  // Step 01 (Add a student): active until students exist, then done.
  // Step 02 (Upload one quiz): pending until students exist, then active.
  const step1State: StepState = hasStudents ? "done" : "active";
  const step2State: StepState = hasStudents ? "active" : "pending";

  return (
    <>
      <SectionEyebrow>{formatDayWelcome(now)}</SectionEyebrow>
      <div className="mt-4 max-w-[640px]">
        <SerifHeadline level="greeting">
          Hi, {userName}. Let&apos;s start with one quiz.
        </SerifHeadline>
      </div>
      <p className="mt-5 max-w-[580px] font-serif text-xl font-light leading-snug text-ink-soft">
        Photograph a graded paper your kid brought home. We&apos;ll read
        what&apos;s on it and tell you the pattern behind the marks — in a
        sentence, not a report.
      </p>

      <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-2">
        <FirstRunStep
          n="01"
          title="Add your kid"
          body="First name and grade. Nothing else. You can add siblings later."
          state={step1State}
          ctaLabel={hasStudents ? "Edit roster" : "Add my first kid"}
          ctaHref="/students"
        />
        <FirstRunStep
          n="02"
          title="Upload one quiz"
          body="A photo from your phone is fine. Already graded? Tell us — we'll read the marks."
          state={step2State}
          ctaLabel="Upload quiz"
          ctaHref="/upload"
        />
      </div>

      <p className="mt-7 text-sm text-ink-mute">
        Takes 30 seconds. You won&apos;t be charged.
      </p>

      <ParentDashboardTrustStrip />
    </>
  );
}

function TeacherFirstRun({
  now,
  userName,
  hasKeys,
  hasStudents,
}: {
  now: Date;
  userName: string;
  hasKeys: boolean;
  hasStudents: boolean;
}) {
  // Step 01 (key): active if no keys, done if keys exist.
  // Step 02 (students): pending until keys exist, then active until students exist, then done.
  // Step 03 (assessment): pending until keys + students exist, then active.
  const step1State: StepState = hasKeys ? "done" : "active";
  const step2State: StepState = !hasKeys
    ? "pending"
    : !hasStudents
      ? "active"
      : "done";
  const step3State: StepState =
    !hasKeys || !hasStudents ? "pending" : "active";

  return (
    <>
      <SectionEyebrow>{formatDayWelcome(now)}</SectionEyebrow>
      <div className="mt-4 max-w-[720px]">
        <SerifHeadline level="greeting">
          Welcome, {userName}. Three quick steps before you grade anything.
        </SerifHeadline>
      </div>
      <p className="mt-5 max-w-[640px] font-serif text-xl font-light leading-snug text-ink-soft">
        You&apos;ll need an answer key for the engine to grade against. Add one
        now and the rest of the flow is just photos.
      </p>

      <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
        <FirstRunStep
          n="01"
          title="Upload an answer key"
          body="PDF or photos. We'll save it to grade against this period's quizzes."
          state={step1State}
          ctaLabel={hasKeys ? "Manage keys" : "Upload key"}
          ctaHref="/keys"
        />
        <FirstRunStep
          n="02"
          title="Add your students"
          body="Roster paste, single add, or skip — you can do this from the upload form."
          state={step2State}
          ctaLabel={hasStudents ? "Edit roster" : "Add students"}
          ctaHref="/students"
        />
        <FirstRunStep
          n="03"
          title="Upload your first batch"
          body="Photograph a stack. We'll grade and surface the patterns by problem."
          state={step3State}
          ctaLabel="Upload assessment"
          ctaHref="/upload"
        />
      </div>

      <p className="mt-7 text-sm text-ink-mute">
        You can skip steps and come back. Nothing&apos;s gated except the
        diagnostic itself.
      </p>
    </>
  );
}

// ─── Shared first-run subcomponents.

type StepState = "active" | "done" | "pending";

function FirstRunStep({
  n,
  title,
  body,
  state,
  ctaLabel,
  ctaHref,
}: {
  n: string;
  title: string;
  body: string;
  state: StepState;
  ctaLabel: string;
  ctaHref: string;
}) {
  const stateLabel = state === "active" ? "Next" : state === "done" ? "Done" : "Pending";
  const showCta = state === "active" || state === "done";

  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col rounded-[var(--radius-sm)] border bg-paper px-6 py-5",
        state === "active" ? "border-ink" : "border-rule",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "font-serif text-xl italic",
            state === "active" ? "text-ink" : "text-ink-mute",
          )}
        >
          {n}
        </span>
        <span
          className={cn(
            "font-mono text-xs uppercase tracking-[0.12em]",
            state === "active"
              ? "text-ink"
              : state === "done"
                ? "text-accent"
                : "text-ink-mute",
          )}
        >
          {stateLabel}
        </span>
      </div>
      <SerifHeadline
        level="card"
        as="h2"
        className="mt-2 font-medium tracking-[-0.01em]"
      >
        {title}
      </SerifHeadline>
      <p className="mt-2 flex-1 text-sm leading-snug text-ink-soft">{body}</p>
      {showCta && (
        <div className="mt-4">
          <Button
            asChild
            variant={state === "active" ? "default" : "secondary"}
            size="sm"
          >
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

// Three bold-prefixed serif statements on paper-soft. Distinct from the
// landing TrustBand (4-commitment grid). Single-use: appears only at the
// bottom of the parent first-run, giving parents the privacy posture at
// the point of first signup. Name reflects the scope — if a second surface
// ever needs the same pattern, that's the trigger to extract + rename.
function ParentDashboardTrustStrip() {
  return (
    <div className="mt-14 rounded-[var(--radius-sm)] border border-rule-soft bg-paper-soft px-6 py-5 text-sm text-ink-soft">
      <div className="flex flex-wrap gap-x-7 gap-y-2">
        <span>
          <strong className="font-serif text-ink">Never sold.</strong> Student
          data is yours.
        </span>
        <span>
          <strong className="font-serif text-ink">30-day deletion.</strong> On
          request.
        </span>
        <span>
          <strong className="font-serif text-ink">US-only.</strong> Stored in
          the United States.
        </span>
      </div>
    </div>
  );
}
