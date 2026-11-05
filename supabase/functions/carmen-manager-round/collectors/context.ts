/** The context a collector runs with, from the round input and its stored state. */
import type { CollectorRunDeps, CollectorRunInput } from "./run.ts";
import type { Collector, CollectorContext } from "./types.ts";

/** `since` is the last successful run, else the first run, else now (no history). */
export function collectorContext(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
  collector: Collector,
): CollectorContext {
  const row = input.state.find((state) => state.collector === collector.id);
  return {
    tenantId: input.tenantId,
    settings: input.settings,
    loadRules: () => deps.state.loadRules(input.tenantId),
    now: input.now,
    since: new Date(
      row?.last_run_at ?? row?.first_run_at ?? input.now.toISOString(),
    ),
    watermark: row?.watermark ?? null,
    budget: input.budget,
    clientIds: input.clientIds,
    db: deps.db,
    fixtures: input.fixtures,
    dryRun: input.dryRun,
  };
}
