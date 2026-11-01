/**
 * Where the nightly chain of worker calls goes next (AIO-238): the "tables"
 * walk, one "retry" pass over the tables a platform-wide rate limit passed
 * over, then the "accounts" check.
 */
import type { ChunkResult } from "./chunk-types.ts";

/**
 * Passed-over tables the nightly chain carries to its retry pass (keeps the
 * chained body and the id filter small). Any beyond it still have their
 * skipped run, so get_reconciliation_status lists them as not checked.
 */
export const MAX_DEFERRED = 100;

export type ChainStep = {
  phase: "tables" | "retry" | "accounts";
  cursor: string | null;
  deferred?: string[];
};

/**
 * The step after a "tables" or "retry" chunk. Tables a platform-wide rate
 * limit passed over are not left behind by the cursor: they are carried along
 * (`deferred`) and get one more try once the walk is done. The retry pass does
 * not defer again; a table it still cannot reach keeps its skipped run, which
 * get_reconciliation_status reports.
 */
export function nextAfterChunk(
  phase: "tables" | "retry",
  deferred: string[],
  chunk: Pick<ChunkResult, "done" | "next_cursor" | "rate_limited_tables">,
): ChainStep {
  const carry =
    phase === "retry"
      ? deferred
      : [...new Set([...deferred, ...chunk.rate_limited_tables])].slice(
          0,
          MAX_DEFERRED,
        );
  const withDeferred = carry.length ? { deferred: carry } : {};
  if (!chunk.done) {
    return { phase, cursor: chunk.next_cursor, ...withDeferred };
  }
  if (phase === "tables" && carry.length) {
    return { phase: "retry", cursor: null, ...withDeferred };
  }
  return { phase: "accounts", cursor: null };
}
