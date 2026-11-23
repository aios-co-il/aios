import type { ToolExecutionContext } from "../tool-context.ts";
import type { MetaNode } from "../meta-response.ts";
import { readMetaResponse } from "../meta-response.ts";
import { adAccountDisableReason } from "../tool-contracts-admin.ts";

/** Reads account status from the same token and Meta pagination path. */
export async function loadAccountHealthMeta(context: ToolExecutionContext) {
  const { supabase, accessibleTenantIds } = context;
  let { data: integration } = await supabase
    .from("tenant_integrations")
    .select("api_key, shared_from_integration_id")
    .in("tenant_id", accessibleTenantIds)
    .in("integration_type", ["facebook", "facebook_lead_ads"])
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (integration?.shared_from_integration_id && !integration?.api_key) {
    const { data: src } = await supabase
      .from("tenant_integrations")
      .select("api_key")
      .eq("id", integration.shared_from_integration_id)
      .eq("is_active", true)
      .maybeSingle();
    if (src?.api_key) {
      integration = { ...integration, api_key: src.api_key };
    }
  }
  const accessToken = integration?.api_key || null;

  // 4. Fetch all ad accounts in one shot (status + spend_cap)
  const accountStatusById = new Map<
    string,
    {
      status: MetaNode["account_status"] | undefined;
      name: MetaNode["name"] | undefined;
      disable_reason?: unknown;
    }
  >();
  let tokenOk = !!accessToken;
  if (accessToken) {
    try {
      let url: string | null =
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,account_status,disable_reason&limit=200&access_token=${accessToken}`;
      while (url) {
        const r: Response = await fetch(url);
        const res = await readMetaResponse(r);
        if (!res.ok || res.value.error) {
          tokenOk = false;
          break;
        }
        const j = res.value;
        for (const a of j.data || []) {
          accountStatusById.set(String(a.id), {
            status: a.account_status,
            name: a.name,
            disable_reason: adAccountDisableReason(a),
          });
          accountStatusById.set(`act_${a.account_id}`, {
            status: a.account_status,
            name: a.name,
            disable_reason: adAccountDisableReason(a),
          });
        }
        url = j.paging?.next || null;
      }
    } catch {
      tokenOk = false;
    }
  }
  return { accountStatusById, tokenOk };
}
