"use client";

/**
 * Run async tasks with bounded concurrency. Returns when ALL tasks
 * settle. Each task's result/error is captured per-index in `outcomes`.
 *
 * Used by AssessmentUploadForm to PUT N files to R2 with at most
 * `concurrency` in-flight uploads at once.
 */
export interface TaskOutcome {
  ok: boolean;
  error?: Error;
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<TaskOutcome[]> {
  const outcomes: TaskOutcome[] = items.map(() => ({ ok: false }));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const myIndex = cursor;
      cursor += 1;
      if (myIndex >= items.length) return;
      const item = items[myIndex] as T;
      try {
        await task(item, myIndex);
        outcomes[myIndex] = { ok: true };
      } catch (err) {
        outcomes[myIndex] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return outcomes;
}
