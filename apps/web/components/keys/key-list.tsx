import type { AnswerKey } from "@/lib/types";
import { KeyRow } from "./key-row";

export function KeyList({ keys }: { keys: AnswerKey[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
      <table className="w-full text-left">
        <thead className="border-b border-rule-soft bg-paper-soft">
          <tr className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            <th className="py-3 pl-4 pr-4 font-normal">Name</th>
            <th className="py-3 pr-4 font-normal">Pages</th>
            <th className="py-3 pr-4 font-normal">Last used</th>
            <th className="py-3 pr-4 font-normal">Date uploaded</th>
            <th className="py-3 pr-4" />
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => <KeyRow key={k.id} ak={k} />)}
        </tbody>
      </table>
    </div>
  );
}
