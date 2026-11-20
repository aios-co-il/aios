import type { AnalyzeFacebookCampaignArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { fbAnalyzeCampaignInline } from "./campaign-analysis.ts";
import { resolveClientTenantId } from "./client-tenant.ts";

/** Preserves the existing analyze_facebook_campaign executor and side-effect order. */
export async function executeAnalyzeFacebookCampaign(
  args: AnalyzeFacebookCampaignArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds, callerScope } = context;

  await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  if (!args.campaign_id) {
    return { error: "campaign_id_required" };
  }
  // Prefer live inline analysis (includes ad-level CPL). Fall back to edge fn if present.
  const inline = await fbAnalyzeCampaignInline(
    supabase,
    tenantId,
    args.client_id,
    args.campaign_id,
  );
  if (inline && !inline.error) {
    return inline;
  }
  const targetTenantId = await resolveClientTenantId(
    supabase,
    args.client_id,
    accessibleTenantIds[0],
  );
  const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fb-campaign-analyze`;
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      tenant_id: targetTenantId,
      client_id: args.client_id,
      campaign_id: args.campaign_id,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    return { ...json, source: json.source || "fb-campaign-analyze" };
  }
  // Surface a clear error instead of opaque "Requested function was not found"
  if (res.status === 404 || /not found/i.test(JSON.stringify(json))) {
    return inline?.error
      ? {
          error: "analyze_failed",
          details: inline,
          hint: "fb-campaign-analyze edge function missing and live Meta read failed",
        }
      : {
          error: "analyze_failed",
          details: json,
          hint: "fb-campaign-analyze not deployed",
        };
  }
  return inline?.error
    ? { error: "analyze_failed", details: inline }
    : { error: "analyze_failed", details: json };
}
