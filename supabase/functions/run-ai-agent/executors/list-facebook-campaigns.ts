type StoredCampaignStatus = {
  campaign_id?: string | number | null;
  campaign_name?: string | number | null;
  effective_status?: string | null;
  campaign_status?: string | null;
  configured_status?: string | null;
  date?: string | null;
};

type ListedStoredCampaign = {
  campaign_id: string | number;
  campaign_name: string | number;
  status: string | null;
  effective_status: string | null;
  configured_status: string | null;
  last_date: string | null;
};
import type { ListFacebookCampaignsArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { resolveClientTenantId } from "./client-tenant.ts";
import { fbLiveCampaignList } from "./meta-live-campaigns.ts";

/** Preserves the existing list_facebook_campaigns executor and side-effect order. */
export async function executeListFacebookCampaigns(
  args: ListFacebookCampaignsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  if (args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  }
  if (!args.client_id) {
    return { error: "client_id_required", message: "יש להעביר client_id" };
  }
  // LIVE first: read campaign status straight from Meta (synced tables can lag).
  const listTenantId = await resolveClientTenantId(
    supabase,
    args.client_id,
    accessibleTenantIds[0],
  );
  const liveList =
    (await fbLiveCampaignList(supabase, listTenantId, args.client_id)) ||
    (listTenantId !== accessibleTenantIds[0]
      ? await fbLiveCampaignList(
          supabase,
          accessibleTenantIds[0],
          args.client_id,
        )
      : null);
  if (liveList) {
    const search = (args.name_search || "").toString().toLowerCase();
    const campaigns = search
      ? liveList.filter((c) =>
          String(c.campaign_name || "")
            .toLowerCase()
            .includes(search),
        )
      : liveList;
    return { count: campaigns.length, campaigns, source: "live_meta" };
  }
  // Fallback: CRM dynamic tables that hold synced FB insights with status.
  const { data: campaignTables, error: rpcErr } = await supabase.rpc(
    "find_campaign_tables",
    { p_client_ids: [args.client_id] },
  );
  if (rpcErr) {
    throw rpcErr;
  }
  const tableIds = (campaignTables || []).map((t) => t.table_id);
  if (tableIds.length === 0) {
    return {
      count: 0,
      campaigns: [],
      note: "no_campaign_table_for_client — חבר טבלת קמפיינים ללקוח (Meta Ads sync).",
    };
  }

  const { data: records, error } = await supabase
    .from("crm_records")
    .select("data")
    .in("table_id", tableIds)
    .in("tenant_id", accessibleTenantIds);
  if (error) {
    throw error;
  }

  const search = (args.name_search || "").toString().toLowerCase();
  // Dedup by campaign_id, keep row with most recent date
  const map = new Map<string | number, ListedStoredCampaign>();
  for (const r of records || []) {
    const d = (r.data || {}) as StoredCampaignStatus;
    const cid = d.campaign_id;
    if (!cid) {
      continue;
    }
    const name = d.campaign_name || "";
    if (search && !String(name).toLowerCase().includes(search)) {
      continue;
    }
    const status =
      d.effective_status ?? d.campaign_status ?? d.configured_status ?? null;
    const date = d.date || "";
    const existing = map.get(cid);
    if (!existing || date > (existing.last_date || "")) {
      map.set(cid, {
        campaign_id: cid,
        campaign_name: name,
        status,
        effective_status: d.effective_status ?? null,
        configured_status: d.configured_status ?? null,
        last_date: date || null,
      });
    }
  }
  const campaigns = Array.from(map.values()).sort((a, b) =>
    (b.last_date || "").localeCompare(a.last_date || ""),
  );
  return { count: campaigns.length, campaigns };
}
