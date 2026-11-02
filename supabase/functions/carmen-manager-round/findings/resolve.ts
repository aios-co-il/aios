/** Closing the live findings a collector saw end, through carmen_finding_resolve. */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { FindingResolution } from "../collectors/types.ts";
import { throwIf } from "../../_shared/manager-round/db-error.ts";

/** Closes the collector's live findings named in `items`; returns how many. */
export type ResolveFindings = (
  tenantId: string,
  roundId: string,
  collectorId: string,
  items: FindingResolution[],
) => Promise<number>;

/** ResolveFindings over the service-role client; the RPC names the tenant. */
export function resolveFindings(db: DbClient): ResolveFindings {
  return async (tenantId, roundId, collectorId, items) => {
    if (!items.length) {
      return 0;
    }
    const { data, error } = await db.rpc("carmen_finding_resolve", {
      p_tenant_id: tenantId,
      p_round_id: roundId,
      p_collector: collectorId,
      p_items: items,
    });
    throwIf(error, "carmen_finding_resolve");
    return data?.length ?? 0;
  };
}
