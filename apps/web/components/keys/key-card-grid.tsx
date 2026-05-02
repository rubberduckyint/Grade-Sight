import type { AnswerKey } from "@/lib/types";
import { KeyCard } from "./key-card";
import { AddKeyCard } from "./add-key-card";

export function KeyCardGrid({ keys }: { keys: AnswerKey[] }) {
  return (
    <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => <KeyCard key={k.id} ak={k} />)}
      <AddKeyCard />
    </div>
  );
}
