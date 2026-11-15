/**
 * A manual run of one manager-round check (AIO-597): a signed-in owner of the
 * tenant (carmen_manager_is_owner, read as that user) asks for one check; the
 * round runs it now for that tenant only, forced whether or not it is due,
 * and the answer is that check's result. The run is real: the model is
 * called, findings are written, and sends follow the tenant's mode.
 */
import { corsHeaders } from "../_shared/cors.ts";
import type { CollectorRunResult } from "../_shared/manager-round/runnable-collectors.ts";
import { parseRunRequest, type RunRequest } from "./request.ts";
import { collectorResult } from "./result.ts";

export type RunDeps = {
  /** The caller's user id, or null when the token is not a signed-in user. */
  userId: (authorization: string) => Promise<string | null>;
  /** True when the caller may run the round for the tenant. */
  isOwner: (authorization: string, tenantId: string) => Promise<boolean>;
  /** carmen-manager-round's JSON report for this tenant and check. */
  runRound: (request: RunRequest) => Promise<unknown>;
};

/** The response to one request. */
export async function handleRun(
  req: Request,
  deps: RunDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }
  const authorization = req.headers.get("Authorization") ?? "";
  const userId = authorization.startsWith("Bearer ")
    ? await deps.userId(authorization)
    : null;
  if (!userId) {
    return reply({ error: "unauthorized" }, 401);
  }
  const parsed = parseRunRequest(await req.json().catch(() => null));
  if (!parsed.ok) {
    console.warn(`[carmen-manager-round-run] refused: ${parsed.error}`);
    return reply({ error: parsed.error }, 400);
  }
  const { request } = parsed;
  if (!(await deps.isOwner(authorization, request.tenantId))) {
    return reply({ error: "forbidden" }, 403);
  }
  try {
    const report = await deps.runRound(request);
    const result: CollectorRunResult = collectorResult(
      report,
      request.tenantId,
      request.collector,
    );
    return reply(result);
  } catch (error) {
    console.error(
      `[carmen-manager-round-run] ${request.collector} for ${request.tenantId} failed`,
      error,
    );
    return reply({ error: "run_failed" }, 502);
  }
}

/** A JSON response with CORS headers. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
