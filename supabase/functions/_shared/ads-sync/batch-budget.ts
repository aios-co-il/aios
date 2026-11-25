/**
 * How many tables one invocation of a self-chaining cron sync processes. A
 * fixed count let one batch of slow accounts run past the edge runtime's
 * 150 s limit, so the invocation died before it kicked the next one and every
 * later table went unsynced until the next scheduled run.
 */

/**
 * A table starts only while less than this has elapsed. The slowest single
 * Facebook table seen took ~60 s, so a table started just before 80 s ends by
 * ~140 s, leaving ~10 s of the 150 s limit for the kick or the pulse request.
 */
export const BATCH_TIME_BUDGET_MS = 80_000;

export type BatchBudget = {
  /** Claims the next table: true for the first, then only while time remains. */
  take(): boolean;
  /** The offset of the first table not taken, or null when none remain. */
  nextOffset(total: number): number | null;
  /** How many tables were taken. */
  readonly taken: number;
};

/** Starts the clock for an invocation that begins at `offset` in the stable table order. */
export function startBatchBudget(
  offset: number,
  options: { budgetMs?: number; now?: () => number } = {},
): BatchBudget {
  const budgetMs = options.budgetMs ?? BATCH_TIME_BUDGET_MS;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let taken = 0;

  return {
    take() {
      // The first table always runs, so every invocation moves the chain on.
      if (taken > 0 && now() - startedAt >= budgetMs) {
        return false;
      }
      taken += 1;
      return true;
    },
    nextOffset(total) {
      const next = offset + taken;
      return next < total ? next : null;
    },
    get taken() {
      return taken;
    },
  };
}
