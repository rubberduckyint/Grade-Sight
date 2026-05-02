import { NewClassButton } from "./new-class-button";

export function EmptyClassList() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="mb-6 text-base text-ink-soft">
        No classes yet. Create your first one.
      </p>
      <NewClassButton />
    </div>
  );
}
