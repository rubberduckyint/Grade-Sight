import { redirect } from "next/navigation";

import { AddStudentForm } from "@/components/add-student-form";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchMe, fetchStudents } from "@/lib/api";

export default async function StudentsPage() {
  const [user, students] = await Promise.all([fetchMe(), fetchStudents()]);
  if (!user) redirect("/sign-in");

  return (
    <AppShell orgName={user.organization?.name}>
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
              <li key={s.id} className="flex items-baseline justify-between py-3">
                <span className="text-base text-ink">{s.full_name}</span>
                {s.date_of_birth && (
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                    DOB {s.date_of_birth}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <AddStudentForm />
      </PageContainer>
    </AppShell>
  );
}
