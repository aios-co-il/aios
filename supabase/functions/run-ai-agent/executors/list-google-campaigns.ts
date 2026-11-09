import type { GoogleAdsIntegrationProjection } from "./google-ads-auth-types.ts";
import type { ListGoogleCampaignsArgs } from "./google-ad-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { googleResolveClientCustomerId } from "../../_shared/client-report-sync.ts";
import { readGoogleAdsCampaignRow } from "../tool-contracts-admin.ts";

/** Preserves the existing list_google_campaigns executor and side-effect order. */
export async function executeListGoogleCampaigns(
  args: ListGoogleCampaignsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  let customerId = args.customer_id
    ? String(args.customer_id).replace(/-/g, "")
    : "";
  if (!customerId && args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
    customerId =
      (await googleResolveClientCustomerId(supabase, args.client_id)) || "";
    if (!customerId) {
      return {
        error:
          "ללקוח אין חשבון Google Ads — חברי טבלת google_ads או השתמשי ב-connect_google_ads_account / customer_id",
      };
    }
  }
  if (!customerId) {
    return { error: "customer_id או client_id נדרש" };
  }

  const { data: gadsInteg } = await supabase
    .from("tenant_integrations")
    .select("settings, additional_config, api_key")
    .in("tenant_id", accessibleTenantIds)
    .eq("integration_type", "google_ads")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
    .returns<GoogleAdsIntegrationProjection>();
  const cfg = {
    ...(gadsInteg?.additional_config || {}),
    ...(gadsInteg?.settings || {}),
  };
  const refreshToken = cfg.refresh_token || gadsInteg?.api_key;
  if (!refreshToken) {
    return { error: "אין חיבור Google Ads פעיל לטננט" };
  }

  const gClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const gClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const gDevToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!gClientId || !gClientSecret || !gDevToken) {
    return { error: "חסרות הגדרות סביבה של Google Ads" };
  }

  const tokResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: gClientId,
      client_secret: gClientSecret,
      grant_type: "refresh_token",
    }),
  });
  const tokData = await tokResp.json();
  if (!tokData.access_token) {
    return {
      error: "כישלון בחידוש טוקן Google Ads",
      details: tokData?.error_description,
    };
  }

  const gadsHeaders: Record<string, string> = {
    Authorization: `Bearer ${tokData.access_token}`,
    "developer-token": gDevToken,
    "Content-Type": "application/json",
  };
  const loginCustomerId = cfg.login_customer_id || cfg.mcc_id || cfg.manager_id;
  if (loginCustomerId) {
    gadsHeaders["login-customer-id"] = String(loginCustomerId).replace(
      /-/g,
      "",
    );
  }

  const statusFilter =
    args.status && args.status !== "ALL"
      ? ` AND campaign.status = '${args.status}'`
      : "";
  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE campaign.status != 'REMOVED'${statusFilter} ORDER BY campaign.name`;
  const searchResp = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: gadsHeaders,
      body: JSON.stringify({ query }),
    },
  );
  const searchData = await searchResp.json();
  if (searchData.error) {
    return {
      error: `Google Ads API: ${searchData.error?.message || JSON.stringify(searchData.error)}`,
    };
  }

  const searchRows: Array<unknown> = searchData.results || [];
  let campaigns = searchRows.map((row) => {
    const { campaign, campaignBudget, metrics } = readGoogleAdsCampaignRow(row);
    const budgetMicros = campaignBudget.amountMicros;
    const { costMicros, clicks, impressions, conversions } = metrics;
    return {
      campaign_id: String(campaign.id || ""),
      name: campaign.name || null,
      status: campaign.status || null,
      daily_budget:
        budgetMicros != null ? Number(budgetMicros) / 1_000_000 : null,
      cost: costMicros != null ? Number(costMicros) / 1_000_000 : null,
      clicks: clicks != null ? Number(clicks) : null,
      impressions: impressions != null ? Number(impressions) : null,
      conversions: conversions != null ? Number(conversions) : null,
    };
  });
  if (args.name_search) {
    const needle = String(args.name_search).toLowerCase();
    campaigns = campaigns.filter((c) =>
      String(c.name || "")
        .toLowerCase()
        .includes(needle),
    );
  }
  return { customer_id: customerId, count: campaigns.length, campaigns };
}
