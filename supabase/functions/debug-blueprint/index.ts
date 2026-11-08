import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Json } from "../_shared/database.types.ts";
import { jsonArray, jsonField } from "../_shared/json-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { scenario_id, api_token, region } = await req.json();
    const baseUrl = `https://${region || "eu2"}.make.com/api/v2`;
    const res = await fetch(`${baseUrl}/scenarios/${scenario_id}/blueprint`, {
      headers: {
        Authorization: `Token ${api_token}`,
        "Content-Type": "application/json",
      },
    });
    const data: Json = await res.json();

    // Extract modules
    let bp = data;
    const responseBlueprint = jsonField(jsonField(bp, "response"), "blueprint");
    const blueprint = jsonField(bp, "blueprint");
    if (responseBlueprint) bp = responseBlueprint;
    else if (blueprint) bp = blueprint;

    const modules = jsonArray(jsonField(bp, "flow")).map((m) => {
      const mapper = jsonField(m, "mapper");
      return {
        id: jsonField(m, "id"),
        module: jsonField(m, "module"),
        mapper_keys: mapper ? Object.keys(mapper) : [],
        mapper_sample: mapper ? JSON.stringify(mapper).slice(0, 500) : null,
      };
    });

    return new Response(
      JSON.stringify({ modules, raw_keys: Object.keys(bp ?? {}) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
