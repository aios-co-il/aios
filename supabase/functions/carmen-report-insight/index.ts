// Carmen's read of a dashboard report, on demand only: the user presses
// "בקש תובנה מכרמן" and the dashboard sends the figures already on screen.
// Nothing here reads tenant data, so the caller only needs to be signed in.
import { aiChat } from "../_shared/ai.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { userClient } from "../_shared/supabase-clients.ts";
import { insightPrompt } from "./prompt.ts";
import { reportInsightRequest } from "./request.ts";
import type { ReportInsightResponse } from "./types.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }
  const userId = await signedInUserId(req);
  if (!userId) {
    return reply({ error: "Unauthorized" }, 401);
  }
  const parsed = reportInsightRequest.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    console.warn(
      "carmen-report-insight: rejected request",
      parsed.error.issues,
    );
    return reply({ error: "Invalid report" }, 400);
  }
  const insight = await aiChat(insightPrompt(parsed.data), {
    source: "carmen-report-insight",
  });
  if (!insight?.trim()) {
    console.error("carmen-report-insight: no answer from the model", {
      userId,
    });
    return reply({ error: "Carmen could not answer" }, 502);
  }
  const body: ReportInsightResponse = { insight: insight.trim() };
  return reply(body);
});

/** The caller's user id from their JWT, or null when not signed in. */
async function signedInUserId(req: Request): Promise<string | null> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const { data, error } = await userClient(authorization).auth.getUser();
  if (error) {
    console.warn("carmen-report-insight: auth failed", error.message);
  }
  return data.user?.id ?? null;
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
