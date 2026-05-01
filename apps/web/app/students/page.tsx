import Link from "next/link";
import { redirect } from "next/navigation";

import { AddStudentForm } from "@/components/add-student-form";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchMe, fetchStudents } from "@/lib/api";
import { PARENT_TABS, TEACHER_TABS } from "@/lib/nav";

export default async function StudentsPage() {
  const [user, students] = await Promise.all([fetchMe(), fetchStudents()]);
  if (!user) redirect("/sign-in");

  const role = user.role === "teacher" ? "teacher" : "parent";
  const tabs = role === "teacher" ? TEACHER_TABS : PARENT_TABS;

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={tabs}
      activeHref="/students"
      uploadHref="/upload"
    >
      <PageContainer className="max-w-[800px]">
        <SectionEyebrow>Roster</SectionEyebrow>
        <div className="mt-4 mb-10">
          <SerifHeadline level="page" as="h1">
            Your students
          </SerifHeadline>
        </div>

        {students.length === 0 ? (
          <p className="mb-10 text-base text-ink-soft">
            No students yet. Add your first one below.
          </p>
        ) : (
          <ul className="mb-10 divide-y divide-rule-soft border-y border-rule-soft">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/students/${s.id}`}
                  className="flex items-baseline justify-between py-3 hover:bg-paper-soft -mx-2 px-2 rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="text-base text-ink">{s.full_name}</span>
                  <span className="flex items-baseline gap-3">
                    {s.grade_level != null && (
                      <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                        Grade {s.grade_level}
                      </span>
                    )}
                    <span aria-hidden="true" className="font-mono text-xs text-ink-mute">›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <AddStudentForm />
      </PageContainer>
    </AppShell>
  );
}
