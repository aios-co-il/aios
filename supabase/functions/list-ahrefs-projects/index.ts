// List all Ahrefs projects (Rank Tracker) available for the connected API key.
// This endpoint is FREE and does not consume API credits.
import { getArray, getPath } from "../_shared/provider-json-b24.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ahrefsApiKey = Deno.env.get("AHREFS_API_KEY");
    if (!ahrefsApiKey) {
      return new Response(
        JSON.stringify({ error: "Ahrefs API key not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const res = await fetch(
      "https://api.ahrefs.com/v3/management/projects?output=json",
      {
        headers: {
          Authorization: `Bearer ${ahrefsApiKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Ahrefs projects fetch failed:", res.status, errText);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch Ahrefs projects",
          details: errText,
        }),
        {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const json: unknown = await res.json();
    const projects = getArray(json, "projects").map((p) => ({
      project_id: getPath(p, "project_id"),
      project_name: getPath(p, "project_name"),
      url: getPath(p, "url"),
      // Strip trailing slash & protocol so the UI can show a clean domain
      domain: String(getPath(p, "url") || "")
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, ""),
      mode: getPath(p, "mode"),
      protocol: getPath(p, "protocol"),
      keyword_count: getPath(p, "keyword_count"),
      access: getPath(p, "access"),
    }));

    // Sort alphabetically by project_name for the picker UX
    projects.sort((a, b) =>
      String(a.project_name).localeCompare(String(b.project_name)),
    );

    return new Response(JSON.stringify({ projects }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in list-ahrefs-projects:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
