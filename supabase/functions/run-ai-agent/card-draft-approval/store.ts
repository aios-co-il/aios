/**
 * The approval's database reads and writes, always within the run's tenant:
 * the live finding by its code, the caller's assignment to the client, and
 * the card write with the finding's closing (card-draft-write.ts).
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import { cardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { ApprovalPorts } from "./ports.ts";

/** The ports over the service-role client. */
export function approvalPorts(db: DbClient): ApprovalPorts {
  return {
    async findLive(tenantId, shortCode) {
      const { data, error } = await db
        .from("carmen_findings")
        .select("id, client_id, agency_id, short_code, owner_user_id, evidence")
        .eq("tenant_id", tenantId)
        .eq("short_code", shortCode)
        .in("status", [...FINDING_LIVE_STATUSES])
        .maybeSingle();
      if (error) {
        throw new Error(`carmen_findings: ${error.message}`);
      }
      return data;
    },

    async isAssigned(tenantId, clientId, campaignerId, now) {
      const { data, error } = await db
        .from("client_team")
        .select("start_date, end_date, campaigners!inner(tenant_id, active)")
        .eq("client_id", clientId)
        .eq("campaigner_id", campaignerId)
        .eq("campaigners.tenant_id", tenantId)
        .eq("campaigners.active", true);
      if (error) {
        throw new Error(`client_team: ${error.message}`);
      }
      const today = jerusalemYmd(now);
      return (data ?? []).some(
        (row) =>
          (!row.start_date || row.start_date <= today) &&
          (!row.end_date || row.end_date >= today),
      );
    },

    write: cardDraftWritePorts(db),
  };
}
