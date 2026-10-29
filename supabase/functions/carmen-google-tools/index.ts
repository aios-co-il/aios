// Carmen Google Ads Tools — pause/resume/update_budget at campaign level via Google Ads API v23.
// Per project memory: Google Ads API v23, micros costs, MCC-aware.
// Callers (AIO-239, ./gate.ts): the service role (approval execute, scheduler)
// with the tenant in the body, or a user JWT scoped to the user's own tenant.
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { Database } from "../_shared/database.types.ts";
import { type JsonObject, thrownMessage } from "../_shared/json-narrow.ts";
import { isNumericId } from "../_shared/ad-tools/ids.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { authorizeGoogleCall } from "./gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const GADS_API = "https://googleads.googleapis.com/v23";

type GadsAuth = {
  access_token?: string;
  developer_token?: string;
  login_customer_id?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
};

async function getGadsAuth(
  supabase: SupabaseClient<Database>,
  tenant_id: string,
): Promise<GadsAuth | null> {
  const { data } = await supabase
    .from("tenant_integrations")
    .select("api_key, additional_config")
    .eq("tenant_id", tenant_id)
    .eq("integration_type", "google_ads")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const cfg = data.additional_config || {};
  return {
    refresh_token: cfg.refresh_token || data.api_key,
    developer_token:
      Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || cfg.developer_token,
    login_customer_id: cfg.login_customer_id || cfg.mcc_id,
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") || cfg.client_id,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || cfg.client_secret,
  };
}

async function exchangeAccessToken(auth: GadsAuth): Promise<string | null> {
  if (!auth?.refresh_token || !auth?.client_id || !auth?.client_secret)
    return null;
  const body = new URLSearchParams({
    refresh_token: auth.refresh_token,
    client_id: auth.client_id,
    client_secret: auth.client_secret,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
  });
  const j = await r.json();
  return j.access_token || null;
}

function err(message: string, status = 400, extra: JsonObject = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: corsHeaders,
  });
}
function ok(payload: JsonObject) {
  return new Response(JSON.stringify({ success: true, ...payload }), {
    status: 200,
    headers: corsHeaders,
  });
}

async function gadsMutate(
  customer_id: string,
  body: unknown,
  headers: Record<string, string>,
) {
  const r = await fetch(
    `${GADS_API}/customers/${customer_id}/googleAds:mutate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
  const j = await r.json();
  return { ok: r.ok && !j?.error, json: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient<Database>(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
    );
    const parsed = await req.json().catch(() => ({}));
    const body = parsed && typeof parsed === "object" ? parsed : {};
    const { action, customer_id, campaign_id, daily_budget, confirmed } = body;

    // Never trust tenant_id from the body for a user: the gate derives it.
    const gate = await authorizeGoogleCall(req, body, {
      db: serviceClient(),
      serviceRoleKey,
    });
    if (!gate.ok) {
      return err(gate.error, gate.status, { message: gate.message });
    }
    const caller = gate.caller;
    const tenant_id = caller.tenantId;

    if (!tenant_id || !action || !customer_id)
      return err("tenant_id, action, customer_id required");
    if (!confirmed)
      return err("not_confirmed", 403, {
        message: "דורש אישור מפורש (confirmed=true)",
      });

    const auth = await getGadsAuth(supabase, tenant_id);
    if (!auth?.developer_token) return err("gads_not_connected");
    const accessToken = await exchangeAccessToken(auth);
    if (!accessToken) return err("gads_token_exchange_failed");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": auth.developer_token,
    };
    if (auth.login_customer_id)
      headers["login-customer-id"] = String(auth.login_customer_id).replace(
        /-/g,
        "",
      );

    const cleanCustomer = String(customer_id).trim().replace(/-/g, "");
    const cleanCampaign = String(campaign_id ?? "").trim();

    let result: JsonObject = {};
    switch (action) {
      case "pause":
      case "resume": {
        if (!campaign_id) return err("campaign_id required");
        const status = action === "pause" ? "PAUSED" : "ENABLED";
        const r = await gadsMutate(
          cleanCustomer,
          {
            mutateOperations: [
              {
                campaignOperation: {
                  update: {
                    resourceName: `customers/${cleanCustomer}/campaigns/${cleanCampaign}`,
                    status,
                  },
                  updateMask: "status",
                },
              },
            ],
          },
          headers,
        );
        if (!r.ok) return err("gads_api_error", 400, { gads_error: r.json });
        result = { campaign_id, status };
        break;
      }
      case "update_budget": {
        if (!campaign_id || daily_budget == null)
          return err("campaign_id, daily_budget required");
        // Interpolated into GAQL below.
        if (!isNumericId(cleanCampaign)) {
          return err("invalid_campaign_id");
        }
        // Need budget resource id — fetch campaign first
        const sr = await fetch(
          `${GADS_API}/customers/${cleanCustomer}/googleAds:search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({
              query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${cleanCampaign}`,
            }),
          },
        );
        const sj = await sr.json();
        const budgetRes = sj?.results?.[0]?.campaign?.campaignBudget;
        if (!budgetRes)
          return err("gads_budget_not_found", 400, { search_result: sj });
        const microsAmount = Math.round(Number(daily_budget) * 1_000_000);
        const r = await gadsMutate(
          cleanCustomer,
          {
            mutateOperations: [
              {
                campaignBudgetOperation: {
                  update: {
                    resourceName: budgetRes,
                    amountMicros: String(microsAmount),
                  },
                  updateMask: "amount_micros",
                },
              },
            ],
          },
          headers,
        );
        if (!r.ok) return err("gads_api_error", 400, { gads_error: r.json });
        result = { campaign_id, daily_budget };
        break;
      }
      default:
        return err("invalid_action", 400, {
          valid: ["pause", "resume", "update_budget"],
        });
    }

    await supabase
      .from("agent_action_log")
      .insert({
        tenant_id,
        user_id: caller.kind === "user" ? caller.userId : null,
        action_type: `gads_${action}`,
        status: "success",
        action_details: { request: body, result, caller: caller.kind },
      })
      .then(
        () => {},
        () => {},
      );

    return ok({ action, ...result });
  } catch (e) {
    console.error("[carmen-google-tools]", e);
    return err(String(thrownMessage(e) || e), 500);
  }
});
