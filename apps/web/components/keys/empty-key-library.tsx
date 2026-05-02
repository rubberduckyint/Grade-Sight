import { AddKeyCard } from "./add-key-card";

export function EmptyKeyLibrary() {
  return (
    <div className="mx-auto max-w-md py-12">
      <p className="text-base text-ink-soft text-center mb-6">
        No keys yet. Upload your first one — verify once, reuse forever.
      </p>
      <AddKeyCard />
    </div>
  );
}
