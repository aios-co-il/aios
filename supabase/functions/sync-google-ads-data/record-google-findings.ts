/**
 * Records the Google side of David's status rules for one active report: the
 * findings of one full campaign read, through the same recorder as the Meta
 * monitor (client named, managers + the client's campaigners, cleared alerts
 * closed).
 */
import {
  googleFindingsFor,
  type OperationalCampaignState,
} from "../_shared/campaign-operational-health.ts";
import { recordFindings } from "../_shared/campaign-status-alerts/record.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";

export async function recordGoogleFindings(input: {
  tenantId: string;
  clientId: string;
  customerId: string;
  campaigns: OperationalCampaignState[];
}): Promise<{ created: number; resolved: number }> {
  const db = serviceClient();
  const { data: client } = await db
    .from("clients")
    .select("name")
    .eq("id", input.clientId)
    .maybeSingle();
  return await recordFindings(db, {
    tenantId: input.tenantId,
    report: {
      platform: "google",
      adAccountId: input.customerId,
      clientId: input.clientId,
      clientName: client?.name ?? null,
      integrationId: null,
    },
    findings: googleFindingsFor(input.customerId, input.campaigns),
  });
}
