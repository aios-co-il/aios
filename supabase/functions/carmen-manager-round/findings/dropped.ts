/**
 * Candidates carmen_finding_upsert did not store, by outcome, for the run's
 * heartbeat stats. All but 'suppressed' (a finding the owner dismissed
 * lately, skipped by design) are also logged with their kind and fingerprint,
 * so a detector that keeps losing findings shows in the logs.
 */
import {
  UPSERT_DROPPED,
  type UpsertDrop,
  type UpsertOutcome,
} from "./types.ts";

export type DroppedCounts = Partial<Record<UpsertDrop, number>>;

/** Logged candidates per call; the counts always cover all of them. */
const LOGGED_CANDIDATES = 20;

/** Counts the candidates the upsert did not store and logs the unexpected ones. */
export function reportDropped(
  source: { tenantId: string; collector: string },
  outcomes: UpsertOutcome[],
): DroppedCounts {
  const counts: DroppedCounts = {};
  const unexpected: UpsertOutcome[] = [];
  for (const entry of outcomes) {
    const drop = UPSERT_DROPPED.find((outcome) => outcome === entry.outcome);
    if (!drop) {
      continue;
    }
    counts[drop] = (counts[drop] ?? 0) + 1;
    if (drop !== "suppressed") {
      unexpected.push(entry);
    }
  }
  if (unexpected.length) {
    const details = {
      tenant_id: source.tenantId,
      collector: source.collector,
      counts,
      candidates: unexpected
        .slice(0, LOGGED_CANDIDATES)
        .map(({ kind, fingerprint, outcome }) => ({
          kind,
          fingerprint,
          outcome,
        })),
    };
    console.error(
      `[carmen-manager-round] candidates not stored: ${JSON.stringify(details)}`,
    );
  }
  return counts;
}

/** How many candidates were not stored for a reason other than a dismissal. */
export function unexpectedDrops(counts: DroppedCounts): number {
  return Object.entries(counts).reduce(
    (sum, [outcome, count]) => sum + (outcome === "suppressed" ? 0 : count),
    0,
  );
}
