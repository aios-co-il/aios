/**
 * The confirmation tool's database calls, always within the run's tenant:
 * the live finding by its code, then carmen_finding_confirm_contact, which
 * decides in the tenant whether this person may log it and writes the card
 * entry and the resolution in one transaction.
 */
import type { Database } from "../../_shared/database.types.ts";
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { ConfirmOutcome, FindingDraftPorts } from "./ports.ts";

type ConfirmRow =
  Database["public"]["Functions"]["carmen_finding_confirm_contact"]["Returns"][number];

/** The ports over the service-role client. */
export function findingDraftPorts(db: DbClient): FindingDraftPorts {
  return {
    async findLive(tenantId, shortCode) {
      const { data, error } = await db
        .from("carmen_findings")
        .select("id, kind, short_code, evidence")
        .eq("tenant_id", tenantId)
        .eq("short_code", shortCode)
        .in("status", [...FINDING_LIVE_STATUSES])
        .maybeSingle();
      if (error) {
        throw new Error(`carmen_findings: ${error.message}`);
      }
      return data;
    },

    async confirm(request) {
      const { data, error } = await db.rpc("carmen_finding_confirm_contact", {
        p_tenant_id: request.tenantId,
        p_finding_id: request.findingId,
        p_user_id: request.userId,
        p_update_type: request.updateType,
        p_content: request.content,
      });
      if (error) {
        throw new Error(`carmen_finding_confirm_contact: ${error.message}`);
      }
      return outcomeOf(data?.[0]);
    },
  };
}

/** The function's row as an outcome; a missing or unknown one is not_found. */
function outcomeOf(row: ConfirmRow | undefined): ConfirmOutcome {
  if (row?.outcome === "logged") {
    return { outcome: "logged", entryId: row.entry_id, inserted: row.inserted };
  }
  if (row?.outcome === "read_only") {
    return { outcome: "read_only" };
  }
  return { outcome: "not_found" };
}
