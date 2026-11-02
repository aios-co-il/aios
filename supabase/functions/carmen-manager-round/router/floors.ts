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

/**
 * The notify floor of every kind for one tenant, from its round state. The
 * state is read before the collectors run, so a collector without a state row
 * is on its first run and floors its kinds at `now` (fail closed). The
 * fixtures-only self-test collector declares every kind and never writes, so
 * it sets no floor.
 */
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
  const firstRun = (key: string) =>
    state.find((entry) => entry.collector === key)?.first_run_at ??
    now.toISOString();
  for (const collector of collectors) {
    if (!collector.fixturesOnly) {
      raise(collector.kinds, firstRun(collector.id));
    }
  }
  raise(ROUTER_KINDS, firstRun(ROUND_STATE_KEY));
  return floors;
}
