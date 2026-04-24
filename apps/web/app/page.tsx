import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 md:p-24">
      <div className="flex flex-col items-center gap-8 text-center">
        <div>
          <h1 className="text-5xl font-bold tracking-tight">Grade-Sight</h1>
          <p className="mt-3 text-lg text-gray-600">
            Diagnostic grading for secondary math.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up/parent"
            className="rounded-lg border border-gray-300 px-6 py-3 text-base font-medium hover:bg-gray-50"
          >
            Sign up as parent
          </Link>
          <Link
            href="/sign-up/teacher"
            className="rounded-lg bg-black px-6 py-3 text-base font-medium text-white hover:bg-gray-800"
          >
            Sign up as teacher
          </Link>
        </div>
        <Link href="/sign-in" className="text-sm text-gray-500 underline">
          Already have an account? Sign in
        </Link>
      </div>
    </main>
  );
}
