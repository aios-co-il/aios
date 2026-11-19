import type { GoogleAdsIntegrationProjection } from "./google-ads-auth-types.ts";
import type { ListGoogleAdAccountsArgs } from "./google-ad-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { buildGoogleCustomerClientMap } from "../../_shared/client-report-sync.ts";

/** Preserves the existing list_google_ad_accounts executor and side-effect order. */
export async function executeListGoogleAdAccounts(
  args: ListGoogleAdAccountsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data: gadsInteg } = await supabase
    .from("tenant_integrations")
    .select("settings")
    .in("tenant_id", accessibleTenantIds)
    .eq("integration_type", "google_ads")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
    .returns<GoogleAdsIntegrationProjection>();

  if (!gadsInteg?.settings?.refresh_token) {
    return {
      error:
        "אין חיבור Google Ads פעיל לטננט הזה. יש לחבר תחילה דרך הגדרות האינטגרציות.",
    };
  }

  const gClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const gClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const gDevToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!gClientId || !gClientSecret || !gDevToken) {
    return {
      error:
        "חסרות הגדרות סביבה של Google Ads (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_ADS_DEVELOPER_TOKEN)",
    };
  }

  const tokResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      refresh_token: gadsInteg.settings.refresh_token,
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
  const gAccessToken = tokData.access_token;

  const gadsHeaders: Record<string, string> = {
    Authorization: `Bearer ${gAccessToken}`,
    "developer-token": gDevToken,
  };

  // List all customers this token can access
  const listResp = await fetch(
    "https://googleads.googleapis.com/v23/customers:listAccessibleCustomers",
    {
      headers: gadsHeaders,
    },
  );
  const listData = await listResp.json();
  if (listData.error) {
    return {
      error: `Google Ads API: ${listData.error?.message || JSON.stringify(listData.error)}`,
    };
  }

  const resourceNames: Array<string> = listData.resourceNames || [];
  const customerIds = resourceNames.map((r: string) =>
    r.replace("customers/", ""),
  );

  // Fetch name+status for each customer in parallel
  const accounts = await Promise.all(
    customerIds.map(async (cid: string) => {
      try {
        const r = await fetch(
          `https://googleads.googleapis.com/v23/customers/${cid}/googleAds:search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...gadsHeaders },
            body: JSON.stringify({
              query:
                "SELECT customer.id, customer.descriptive_name, customer.status, customer.manager FROM customer LIMIT 1",
            }),
          },
        );
        const d = await r.json();
        const row = d.results?.[0]?.customer;
        if (!row) {
          return {
            customer_id: cid,
            name: null,
            status: null,
            is_manager: false,
          };
        }
        return {
          customer_id: cid,
          name: row.descriptiveName ?? null,
          status: row.status ?? null,
          is_manager: row.manager ?? false,
        };
      } catch {
        return {
          customer_id: cid,
          name: null,
          status: null,
          is_manager: false,
        };
      }
    }),
  );

  // Look up which clients are linked via client card or assigned google_ads tables
  const clientByAccountId = await buildGoogleCustomerClientMap(
    supabase,
    accessibleTenantIds,
  );

  let result = accounts.map((a) => ({
    customer_id: a.customer_id,
    name: a.name,
    status: a.status,
    is_manager: a.is_manager,
    client_id: clientByAccountId.get(a.customer_id)?.id ?? null,
    client_name: clientByAccountId.get(a.customer_id)?.name ?? null,
  }));

  if (args.client_id) {
    result = result.filter((a) => a.client_id === args.client_id);
  }

  return { count: result.length, accounts: result };
}
