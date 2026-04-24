import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign up as a teacher</h1>
          <p className="mt-1 text-sm text-gray-600">
            We&apos;ll create your classroom organization automatically — you can rename it later.
          </p>
        </div>
        <SignUp
          unsafeMetadata={{ role: "teacher" }}
          signInUrl="/sign-in"
        />
      </div>
    </main>
  );
}
