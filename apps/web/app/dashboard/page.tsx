import { SignOutButton } from "@clerk/nextjs";
import { fetchMe } from "@/lib/api";

export default async function DashboardPage() {
  const user = await fetchMe();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>Loading…</p>
      </main>
    );
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-lg">
          Logged in as <strong>{displayName}</strong> ({user.role})
        </p>
        {user.organization && (
          <p className="text-sm text-gray-600">
            Organization: {user.organization.name}
          </p>
        )}
      </div>
      <SignOutButton />
    </main>
  );
}
