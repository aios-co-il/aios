// replay-agent-run — creates a fresh run from an existing run's goal & context.
// Body: { run_id, tenant_id, user_id? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { errorMessage } from "../_shared/error-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const { run_id, tenant_id, user_id } = await req.json();
    if (!run_id || !tenant_id)
      return jsonResponse({ error: "missing run_id/tenant_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: orig, error } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", run_id)
      .single();
    if (error || !orig) throw new Error("source run not found");

    const { data: invokeData, error: invokeErr } =
      await supabase.functions.invoke("run-ai-agent-v2", {
        body: {
          agent_id: orig.agent_id,
          goal: orig.goal,
          context: orig.context ?? {},
          tenant_id,
          user_id: user_id ?? null,
          trigger_source: "replay",
          replay_of_run_id: run_id,
          max_steps: orig.max_steps ?? 12,
        },
      });
    if (invokeErr) throw invokeErr;

    if (invokeData?.run_id) {
      await supabase
        .from("agent_runs")
        .update({ replay_of_run_id: run_id })
        .eq("id", invokeData.run_id);
    }

    return jsonResponse({ ok: true, ...invokeData });
  } catch (e) {
    console.error("[replay-agent-run]", errorMessage(e));
    return jsonResponse({ error: String(errorMessage(e) ?? e) }, 500);
  }
});
