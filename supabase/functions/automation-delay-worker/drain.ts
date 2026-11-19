// One worker call: resume every due wait, one at a time (AIO-611).
import {
  type PausedRun,
  type ResumeDeps,
  type ResumeResult,
  resumePausedRun,
} from "./resume-run.ts";

/** The automation_delayed_runs statements a worker call makes. */
export type WaitStore = {
  /** Ids of the waits that are due, oldest first. */
  dueRunIds(): Promise<Array<string>>;
  /** Claims one wait; null when another worker took it or it is no longer waiting. */
  claim(id: string): Promise<PausedRun | null>;
  /** Writes how a claimed wait ended. */
  record(run: PausedRun, result: ResumeResult): Promise<void>;
};

/** How many waits a worker call resumed, cancelled, failed, or left for the next call. */
export type DrainCounts = Record<ResumeResult["status"], number> & {
  left_waiting: number;
};

/**
 * Resumes the due waits. Each wait is claimed just before its resume is
 * attempted, so a worker that stops early leaves the rest `waiting` for the
 * next call, and only an attempted wait can end up `failed`.
 */
export async function resumeDueRuns(
  store: WaitStore,
  deps: ResumeDeps,
  outOfTime: () => boolean,
): Promise<DrainCounts> {
  const counts: DrainCounts = {
    resumed: 0,
    cancelled: 0,
    failed: 0,
    left_waiting: 0,
  };
  const dueIds = await store.dueRunIds();
  for (const [index, id] of dueIds.entries()) {
    if (outOfTime()) {
      counts.left_waiting = dueIds.length - index;
      break;
    }
    const run = await store.claim(id);
    if (!run) {
      continue;
    }
    const result = await resumePausedRun(run, deps);
    counts[result.status]++;
    try {
      await store.record(run, result);
    } catch (error) {
      // Not rethrown: the other due waits still get their turn. The row stays
      // `resuming` and the stale sweep marks it failed, so it is never re-sent.
      console.error(
        `[automation-delay-worker] result of ${run.id} (${result.status}) not recorded:`,
        error,
      );
    }
  }
  return counts;
}
