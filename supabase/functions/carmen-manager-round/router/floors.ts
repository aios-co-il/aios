/**
 * Notify floors: a kind never notifies about an event older than the first
 * run of the collector that reports it for the tenant (or, for the router's
 * own kinds, the tenant's first round). A collector that ships while a tenant
 * is already sending therefore starts quiet instead of alerting on history.
 */
import type { Collector } from "../collectors/types.ts";
import { ROUTER_KINDS } from "../recipients/data-findings.ts";
import { ROUND_STATE_KEY, type RoundStateRow } from "../state/store.ts";
import type { NotifyFloors } from "./route.ts";

/** The notify floor of every kind for one tenant, from its round state. */
export function notifyFloors(
  collectors: readonly Collector[],
  state: RoundStateRow[],
  now: Date,
): NotifyFloors {
  const floors: NotifyFloors = {};
  const raise = (kinds: readonly (keyof NotifyFloors)[], at: string) => {
    for (const kind of kinds) {
      const current = floors[kind];
      if (!current || Date.parse(at) > Date.parse(current)) {
        floors[kind] = at;
      }
    }
  };
  for (const collector of collectors) {
    const row = state.find((entry) => entry.collector === collector.id);
    if (row) {
      raise(collector.kinds, row.first_run_at);
    }
  }
  const firstRound = state.find(
    (entry) => entry.collector === ROUND_STATE_KEY,
  )?.first_run_at;
  raise(ROUTER_KINDS, firstRound ?? now.toISOString());
  return floors;
}
