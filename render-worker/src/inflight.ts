/**
 * The runs this worker holds. On a stop signal they go back to the queue at once, instead of
 * staying "running" until claim_video_run reclaims them 45 minutes later. provider and
 * provider_job_id stay on the row, so a retried clip or lip sync resumes the job it paid for.
 * A run inside a paid submit is waited for: requeued before its job id is saved, it would be
 * submitted and paid for again.
 */
import type { VideoRun } from "./jobs/types.ts";
import type { SupabaseRest } from "./supabaseRest.ts";

export function createInFlight({
  maxAttempts = Infinity,
  now = Date.now,
  sleep = (ms: number): Promise<unknown> =>
    new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const held = new Map<string, HeldRun>();
  const claims = new Set<Promise<unknown>>();
  let closed = false;
  const busy = () =>
    claims.size > 0 || [...held.values()].some((entry) => entry.submitting > 0);
  return {
    /** Wraps the claim call, so a stop also waits for a run already being claimed. */
    async claim<T>(promise: Promise<T>): Promise<T> {
      claims.add(promise);
      try {
        return await promise;
      } finally {
        claims.delete(promise);
      }
    },
    hold(db: Pick<SupabaseRest, "update">, run: HeldRun["run"]) {
      held.set(run.id, { db, run, submitting: 0 });
    },
    release(run: Pick<VideoRun, "id">) {
      held.delete(run.id);
    },
    /** Runs a paid submit and the save of its job id. After a stop no new submit starts. */
    async submitting<T>(
      run: Pick<VideoRun, "id">,
      submit: () => Promise<T>,
    ): Promise<T> {
      if (closed) {
        return new Promise<T>(() => {});
      }
      const entry = held.get(run.id);
      if (entry) entry.submitting += 1;
      try {
        return await submit();
      } finally {
        if (entry) entry.submitting -= 1;
      }
    },
    /**
     * Puts every held run back to queued and returns their ids. A run still inside a submit
     * after waitMs stays running and is reclaimed later as before.
     */
    async requeue({ waitMs = 5000 } = {}) {
      closed = true;
      const deadline = now() + waitMs;
      while (busy() && now() < deadline) await sleep(50);
      // A run out of attempts stays running, so claim_video_run fails it as before instead of
      // queueing it forever. Only this worker's own claim (same attempt) is put back.
      const ready = [...held.values()].filter(
        (entry) =>
          !entry.submitting && Number(entry.run.attempts ?? 0) < maxAttempts,
      );
      const done = await Promise.allSettled(
        ready.map(({ db, run }) =>
          db.update(
            "marketing_runs",
            `id=eq.${run.id}&status=eq.running&attempts=eq.${Number(run.attempts ?? 0)}`,
            {
              status: "queued",
              error: "worker stopped during the job; queued again",
            },
          ),
        ),
      );
      return ready
        .filter((_, index) => done[index].status === "fulfilled")
        .map(({ run }) => run.id);
    },
  };
}

/** A run this worker holds, the client to requeue it with, and its paid submits in progress. */
interface HeldRun {
  db: Pick<SupabaseRest, "update">;
  run: Pick<VideoRun, "id" | "attempts">;
  submitting: number;
}
