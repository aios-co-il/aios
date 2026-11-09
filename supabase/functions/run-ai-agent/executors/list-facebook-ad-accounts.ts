import type { ListFacebookAdAccountsArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { GraphAdAccount } from "../tool-contracts-marketing.ts";
import { readGraphAdAccountsPage } from "../tool-contracts-marketing.ts";

/** Preserves the existing list_facebook_ad_accounts executor and side-effect order. */
export async function executeListFacebookAdAccounts(
  args: ListFacebookAdAccountsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  // Get Facebook access token from tenant_integrations (including shared)
  let { data: integration } = await supabase
    .from("tenant_integrations")
    .select("api_key, settings, shared_from_integration_id")
    .in("tenant_id", accessibleTenantIds)
    .in("integration_type", ["facebook", "facebook_lead_ads"])
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (integration?.shared_from_integration_id && !integration?.api_key) {
    const { data: sourceIntegration } = await supabase
      .from("tenant_integrations")
      .select("api_key, settings")
      .eq("id", integration.shared_from_integration_id)
      .eq("is_active", true)
      .maybeSingle();
    if (sourceIntegration?.api_key) {
      integration = { ...integration, api_key: sourceIntegration.api_key };
    }
  }

  if (!integration?.api_key) {
    return {
      error: "אין אינטגרציית פייסבוק מוגדרת לטננט הזה. יש להגדיר קודם.",
    };
  }

  const accessToken = integration.api_key;
  let allAccounts: Array<GraphAdAccount> = [];
  let nextUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`;
  while (nextUrl) {
    const resp = await fetch(nextUrl);
    const page = readGraphAdAccountsPage(await resp.json());
    if (page.error) {
      return { error: `Facebook API: ${page.error.message}` };
    }
    if (page.data) {
      allAccounts = [...allAccounts, ...page.data];
    }
    nextUrl = page.paging?.next || "";
  }
  return {
    count: allAccounts.length,
    ad_accounts: allAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.account_status,
      currency: a.currency,
    })),
  };
}
