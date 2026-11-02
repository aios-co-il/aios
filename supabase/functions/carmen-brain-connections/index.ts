// carmen-brain-connections — Carmen settings → מוחות, חיבורים ומפתחות AI.
//
// Tenant managers connect chat-model brains (any OpenAI-compatible API), set
// keys for built-in brains and choose what the picker shows. Keys go to
// Supabase Vault through service-role-only SQL functions; responses carry
// only their last 4 characters.
//
// Body: { tenant_id, action, ... }
//   list
//   create        { name, provider_preset, base_url, model, api_key, profile, active }
//   update        { connection_id, name?, provider_preset?, base_url?, model?, profile?, api_key? }
//   delete        { connection_id }
//   test          { connection_id } | { base_url, model, api_key }
//   set_builtin   { builtin_slug, api_key?, external_id? }
//   reset_builtin { builtin_slug }
//   set_active    { route_id, active }
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/security.ts";
import { resolveCarmenAgent } from "../_shared/agent-channel/store.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { isTenantManager } from "./auth.ts";
import { resetBuiltin, setBuiltin } from "./builtin-actions.ts";
import { createModel, deleteModel, updateModel } from "./model-actions.ts";
import { type ActionContext, HttpError } from "./request.ts";
import { listState } from "./state.ts";
import { testModel } from "./test-connection.ts";
import { setActive } from "./visibility.ts";

/** Write actions; each answers with the fresh list. */
const WRITES: Record<string, (ctx: ActionContext) => Promise<void>> = {
  create: createModel,
  update: updateModel,
  delete: deleteModel,
  set_builtin: setBuiltin,
  reset_builtin: resetBuiltin,
  set_active: setActive,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  try {
    const ctx = await actionContext(req);
    const action =
      typeof ctx.body.action === "string" ? ctx.body.action : "list";
    if (action === "test") return json(200, await testModel(ctx));
    const write = WRITES[action];
    if (write) await write(ctx);
    else if (action !== "list")
      throw new HttpError(400, `Unknown action: ${action}`);
    return json(200, await listState(ctx));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error("[carmen-brain-connections]", e);
    return json(500, { error: "Internal error" });
  }
});

/** Signed-in tenant manager, the tenant's Carmen, and the parsed body. */
async function actionContext(req: Request): Promise<ActionContext> {
  const auth = await requireAuth(req);
  if (!auth || auth.kind !== "user" || !auth.userId)
    throw new HttpError(401, "Unauthorized");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    throw new HttpError(400, "Invalid JSON");
  const tenantId =
    typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!tenantId) throw new HttpError(400, "tenant_id is required");

  const sb = serviceClient();
  if (!(await isTenantManager(sb, auth.userId, tenantId)))
    throw new HttpError(403, "Only tenant owners can manage Carmen's brains");
  const carmen = await resolveCarmenAgent(sb, tenantId);
  return {
    sb,
    tenantId,
    agentId: carmen?.id ?? null,
    userId: auth.userId,
    body,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
