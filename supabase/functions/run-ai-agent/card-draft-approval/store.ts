/**
 * The approval's database reads and writes, always within the run's tenant:
 * the live finding by its code, the person's role for it (the database's
 * rule), and the card write with the finding's closing (card-draft-write.ts).
 */
import { cardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import { throwIf } from "../../_shared/manager-round/db-error.ts";
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { ApprovalPorts } from "./ports.ts";

/** The ports over the service-role client. */
export function approvalPorts(db: DbClient): ApprovalPorts {
  return {
    async findLive(tenantId, shortCode) {
      const { data, error } = await db
        .from("carmen_findings")
        .select("id, client_id, agency_id, short_code, evidence")
        .eq("tenant_id", tenantId)
        .eq("short_code", shortCode)
        .in("status", [...FINDING_LIVE_STATUSES])
        .maybeSingle();
      throwIf(error, "carmen_findings");
      return data;
    },

    async roleOf(tenantId, finding, userId) {
      const { data, error } = await db.rpc("carmen_finding_role_of", {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_client_id: finding.client_id ?? undefined,
        p_agency_id: finding.agency_id ?? undefined,
      });
      throwIf(error, "carmen_finding_role_of");
      return data ?? null;
    },

    write: cardDraftWritePorts(db),
  };
}
