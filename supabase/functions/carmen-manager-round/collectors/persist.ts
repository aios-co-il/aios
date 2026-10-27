/**
 * Stores a successful collector run: upsert its candidates, auto-clear what a
 * complete run no longer reports, then save its watermark (only now, so a
 * failed run is retried from the same point).
 */
import type { CollectorRunDeps, CollectorRunInput } from "./run.ts";
import type { Collector, CollectorResult, FindingCandidate } from "./types.ts";

/** Upserts, auto-clears and saves the watermark; returns what changed. */
export async function persistRun(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
  collector: Collector,
  result: CollectorResult,
  candidates: FindingCandidate[],
): Promise<{ inserted: number; cleared: number }> {
  const outcomes = await deps.findings.upsert(
    input.tenantId,
    input.roundId,
    collector,
    candidates,
  );
  const cleared = result.coverage.complete
    ? await clearMissing(deps, input, collector, candidates, result)
    : 0;
  await deps.state.saveCollectorState(input.tenantId, collector.id, {
    ok: true,
    watermark: result.watermark,
    at: input.now,
  });
  const inserted = outcomes.filter((o) => o.outcome === "inserted").length;
  return { inserted, cleared };
}

/** Counts a miss for each kind's live findings the run covered and did not report. */
async function clearMissing(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
  collector: Collector,
  candidates: FindingCandidate[],
  result: CollectorResult,
): Promise<number> {
  let cleared = 0;
  for (const kind of collector.kinds) {
    cleared += await deps.findings.markMissing(input.tenantId, input.roundId, {
      kind,
      seen: candidates
        .filter((candidate) => candidate.kind === kind)
        .map((candidate) => candidate.fingerprint),
      clientIds: result.coverage.clientIds ?? input.clientIds,
      fingerprints: null,
      afterMisses: collector.clearAfterMisses ?? 2,
    });
  }
  return cleared;
}
