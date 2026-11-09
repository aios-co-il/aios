import type { PulseCacheRow } from "./pulse-cache-types.ts";
type RetentionPulseRow = Pick<
  PulseCacheRow,
  "client_id" | "status" | "flags" | "last_client_call_at" | "calculated_at"
>;
import type { GetClientRetentionScanArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { buildRetentionScan } from "../../_shared/client-retention.ts";
import { pulseSurfacePrefersWhatsAppDigest } from "../../_shared/campaign-pulse.ts";

/** Preserves the existing get_client_retention_scan executor and side-effect order. */
export async function executeGetClientRetentionScan(
  args: GetClientRetentionScanArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    callerCampaignerId,
    callerManagedAgencyIds,
    surface,
    accessibleTenantIds,
    bypassCampaignerScope,
  } = context;

  let clientQuery = supabase
    .from("clients")
    .select("id, name, mood_status, status")
    .in("tenant_id", accessibleTenantIds)
    .eq("status", "active");
  if (args.client_id) {
    clientQuery = clientQuery.eq("id", args.client_id);
  }
  if (callerManagedAgencyIds && callerManagedAgencyIds.length > 0) {
    clientQuery = clientQuery.in("agency_id", callerManagedAgencyIds);
  }
  const { data: clientRows, error: clientError } = await clientQuery;
  if (clientError) {
    throw clientError;
  }
  let activeClients = clientRows || [];
  if (args.client_name) {
    const needle = String(args.client_name).toLocaleLowerCase("he");
    activeClients = activeClients.filter((client) =>
      String(client.name || "")
        .toLocaleLowerCase("he")
        .includes(needle),
    );
  }
  if (callerCampaignerId && !bypassCampaignerScope) {
    const { data: links, error: linksError } = await supabase
      .from("client_team")
      .select("client_id")
      .eq("campaigner_id", callerCampaignerId);
    if (linksError) {
      throw linksError;
    }
    const assigned = new Set(
      (links || []).map((link) => link.client_id).filter(Boolean),
    );
    activeClients = activeClients.filter((client) => assigned.has(client.id));
  }
  const clientIds = activeClients.map((client) => client.id).filter(Boolean);
  let callKnown = true;
  let pulseRows: Array<RetentionPulseRow> = [];
  if (clientIds.length) {
    /** Reads the same fallback projection without changing request options. */
    async function loadPulses(columns: string) {
      return await supabase
        .from("campaign_pulse_snapshots")
        .select(columns)
        .in("tenant_id", accessibleTenantIds)
        .in("client_id", clientIds)
        .order("calculated_at", { ascending: false })
        .returns<Array<RetentionPulseRow>>();
    }
    let pulseResult = await loadPulses(
      "client_id, status, flags, last_client_call_at, calculated_at",
    );
    if (
      pulseResult.error &&
      /last_client_call/.test(pulseResult.error.message)
    ) {
      callKnown = false;
      pulseResult = await loadPulses("client_id, status, flags, calculated_at");
    }
    if (pulseResult.error) {
      throw pulseResult.error;
    }
    pulseRows = pulseResult.data || [];
  }
  const freshestPulse = new Map<string, RetentionPulseRow>();
  for (const row of pulseRows) {
    if (!freshestPulse.has(row.client_id)) {
      freshestPulse.set(row.client_id, row);
    }
  }
  const scan = buildRetentionScan(
    activeClients.map((client) => {
      const pulse = freshestPulse.get(client.id);
      return {
        client_id: client.id,
        client_name: client.name || "לקוח",
        mood_status: client.mood_status,
        pulse_status: pulse?.status || null,
        last_client_call_at: pulse?.last_client_call_at || null,
        flags: pulse?.flags || [],
        has_campaign_snapshot: !!pulse,
        call_known: callKnown,
      };
    }),
  );
  const preferDigest = pulseSurfacePrefersWhatsAppDigest(surface);
  return {
    data_source: "stored_pulse_and_crm_mood",
    external_api_called: false,
    ai_used_to_calculate: false,
    outbound_sent: false,
    call_freshness_available: callKnown,
    scanned: scan.scanned,
    act_now_count: scan.act_now_count,
    watch_count: scan.watch_count,
    steady_count: scan.steady_count,
    truncated: scan.truncated,
    whatsapp_digest: scan.whatsapp_digest,
    items: preferDigest ? undefined : scan.items,
    instructions_to_agent:
      "הציגי את whatsapp_digest. אסור לטעון שנשלחה הודעה ללקוח. אסור לעדכן mood בלי בקשה מפורשת לעדכן את הדשבורד.",
  };
}
