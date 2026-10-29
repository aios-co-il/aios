/** The fake findings store's resolve: closes the live findings named. */
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { FindingResolution } from "../collectors/types.ts";
import type { World } from "./fake-world.ts";

/** Marks the live findings matching `items` resolved; returns how many. */
export function resolveLive(
  w: World,
  items: FindingResolution[],
): Promise<number> {
  const ended = w.findings.filter(
    (f) =>
      FINDING_LIVE_STATUSES.some((status) => status === f.status) &&
      items.some((i) => i.kind === f.kind && i.fingerprint === f.fingerprint),
  );
  ended.forEach((f) => (f.status = "resolved"));
  return Promise.resolve(ended.length);
}
