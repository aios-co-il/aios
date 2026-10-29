/**
 * carmen-manager-round (AIO-251): Carmen's manager round. The
 * 'carmen-manager-round-15m' cron calls it with the service-role key; it runs
 * the due collectors of every tenant not switched off, routes the findings
 * and, in david_only / team mode, sends the morning brief and the due alerts
 * from Carmen's own line. See ./collectors/types.ts for the collector contract.
 */
import { serviceClient } from "../_shared/supabase-clients.ts";
import { createRoundDeps } from "./deps.ts";
import { isServiceCaller, parseRoundRequest } from "./request.ts";
import { runRound } from "./round.ts";

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!isServiceCaller(req, serviceKey)) {
    return json(401, { error: "unauthorized" });
  }
  const body = await readBody(req);
  if (body === undefined) {
    return json(400, { error: "invalid_json" });
  }
  const parsed = parseRoundRequest(body, Deno.env.get("APP_ENV"));
  if (!parsed.ok) {
    return json(parsed.status, { error: parsed.error });
  }
  try {
    const deps = createRoundDeps(serviceClient(), {
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey: serviceKey,
    });
    return json(200, await runRound(deps, parsed.request));
  } catch (error) {
    console.error("[carmen-manager-round]", error);
    return json(500, { error: "round_failed" });
  }
});

/** The JSON body ({} when empty), or undefined when it is not JSON. */
async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A JSON response with `status`. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
