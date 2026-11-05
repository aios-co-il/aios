/**
 * Stores a successful collector run: upsert its candidates, close the
 * findings it saw end (with their resolution), auto-clear what a complete run
 * no longer reports, then save its watermark (only now, so a failed run is
 * retried from the same point). `cleared` counts both kinds of closing.
 * Candidates the database did not store are counted and logged
 * (findings/dropped.ts).
 */
import { type DroppedCounts, reportDropped } from "../findings/dropped.ts";
import type { CollectorRunDeps, CollectorRunInput } from "./run.ts";
import type { Collector, CollectorResult, FindingCandidate } from "./types.ts";

/** Upserts, auto-clears and saves the watermark; returns what changed. */
export async function persistRun(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
  collector: Collector,
  result: CollectorResult,
  candidates: FindingCandidate[],
): Promise<{ inserted: number; cleared: number; dropped: DroppedCounts }> {
  const outcomes = await deps.findings.upsert(
    input.tenantId,
    input.roundId,
    collector,
    candidates,
  );
  const resolved = await deps.findings.resolve(
    input.tenantId,
    input.roundId,
    collector.id,
    (result.resolved ?? []).filter((r) => collector.kinds.includes(r.kind)),
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
  const dropped = reportDropped(
    { tenantId: input.tenantId, collector: collector.id },
    outcomes,
  );
  return { inserted, cleared: cleared + resolved, dropped };
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
  const checked = result.coverage.kinds;
  for (const kind of collector.kinds) {
    if (checked && !checked.includes(kind)) {
      continue;
    }
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
