/**
 * The collector registry. A new detector (unanswered requests AIO-252,
 * contact AIO-253, group updates AIO-254; the kinds without a detector yet
 * are listed in _shared/manager-round/kinds.ts) is one file in this folder
 * implementing `Collector` (types.ts) and one entry here. Ids share
 * carmen_round_state with the round's own keys ('_round', 'router',
 * 'brief:*'), and each kind belongs to one collector (registry.test.ts).
 */
import type { Json } from "../../_shared/database.types.ts";
import { latestSlot } from "../calendar/slots.ts";
import type { RoundStateRow } from "../state/store.ts";
import { contactCollector } from "./contact/collector.ts";
import { selfTestCollector } from "./self-test.ts";
import type { Collector } from "./types.ts";

export const COLLECTORS: readonly Collector[] = [
  selfTestCollector,
  contactCollector,
];

export type DueCollector = {
  collector: Collector;
  /** The cron slot this run answers (claimed once), or null for forced and trigger runs. */
  slot: Date | null;
};

export type DueRequest = {
  collectorIds: string[] | null;
  fixtures: Json | null;
};

/**
 * Collectors to run now: those the request names (forced), a fixtures-only
 * collector only when its fixture is given, a cron collector when its latest
 * slot is fresh and newer than the last one it ran, a trigger collector always
 * (its trigger decides in the runner).
 */
export function dueCollectors(
  collectors: readonly Collector[],
  state: RoundStateRow[],
  now: Date,
  request: DueRequest,
): DueCollector[] {
  return collectors.flatMap((collector): DueCollector[] => {
    if (collector.fixturesOnly && !hasFixture(request.fixtures, collector.id)) {
      return [];
    }
    if (request.collectorIds && !request.collectorIds.includes(collector.id)) {
      return [];
    }
    if (
      request.collectorIds ||
      collector.fixturesOnly ||
      !("cron" in collector.schedule)
    ) {
      return [{ collector, slot: null }];
    }
    const slot = latestSlot(
      collector.schedule.cron,
      now,
      collector.schedule.staleMinutes,
    );
    const last = state.find((row) => row.collector === collector.id)?.last_slot;
    return slot && (!last || slot.getTime() > Date.parse(last))
      ? [{ collector, slot }]
      : [];
  });
}

/** True when the request fixtures carry `key`. */
function hasFixture(fixtures: Json | null, key: string): boolean {
  return (
    !!fixtures &&
    typeof fixtures === "object" &&
    !Array.isArray(fixtures) &&
    key in fixtures
  );
}
