import type { AppHeaderTab } from "@/components/app-header";

export const PARENT_TABS: AppHeaderTab[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Students", href: "/students" },
];

export const TEACHER_TABS: AppHeaderTab[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Students", href: "/students" },
  { label: "Assessments", href: "/assessments" },
  { label: "Answer keys", href: "/keys" },
];
