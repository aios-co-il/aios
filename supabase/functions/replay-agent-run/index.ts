// replay-agent-run — creates a fresh run from an existing run's goal & context.
// Body: { run_id, tenant_id, user_id? }
// Who may replay, and in which tenant: ../_shared/agent-runs/run-request.ts (AIO-661).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { openRunRequest } from "../_shared/agent-runs/run-request.ts";
import { requireAuth } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const opened = await openRunRequest(req, supabase, requireAuth, {
      field: "run_id",
    });
    if (!opened.ok) {
      return jsonResponse({ error: opened.error }, opened.status);
    }
    const { tenantId: tenant_id, sourceId: run_id, userId } = opened;

    const { data: orig, error } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", run_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (error) {
      throw new Error(`agent_runs lookup failed: ${error.message}`);
    }
    if (!orig) {
      return jsonResponse({ error: "source run not found" }, 404);
    }

    const { data: invokeData, error: invokeErr } =
      await supabase.functions.invoke("run-ai-agent-v2", {
        body: {
          agent_id: orig.agent_id,
          goal: orig.goal,
          context: orig.context ?? {},
          tenant_id,
          user_id: userId,
          trigger_source: "replay",
          replay_of_run_id: run_id,
          max_steps: orig.max_steps ?? 12,
        },
      });
    if (invokeErr) {
      throw invokeErr;
    }

    if (invokeData?.run_id) {
      await supabase
        .from("agent_runs")
        .update({ replay_of_run_id: run_id })
        .eq("id", invokeData.run_id);
    }

    return jsonResponse({ ok: true, ...invokeData });
  } catch (e: any) {
    console.error("[replay-agent-run]", e?.message);
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});
