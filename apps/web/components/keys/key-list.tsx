import type { AnswerKey } from "@/lib/types";
import { KeyRow } from "./key-row";

export function KeyList({ keys }: { keys: AnswerKey[] }) {
  return (
    <ul className="divide-y divide-rule-soft border-y border-rule-soft">
      {keys.map((k) => <KeyRow key={k.id} ak={k} />)}
    </ul>
  );
}
