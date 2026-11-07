import { corsHeaders } from "../_shared/cors.ts";
import {
  applyBrainLimit,
  BRAIN,
  brainLevel,
} from "../_shared/carmen/brain-access.ts";
import {
  brainDenied,
  loadCarmenAccessRow,
} from "../_shared/carmen/brain-guard.ts";
import { requireAuth } from "../_shared/security.ts";
import {
  cancelParliament,
  clarifyParliamentSeat,
  forceContinueParliament,
  forceSynthesizeParliament,
  startParliament,
} from "../_shared/agent-channel/parliament.ts";
import {
  ensureConversation,
  loadRoute,
  resolveCarmenAgent,
  serviceClient,
  userHasTenantAccess,
} from "../_shared/agent-channel/store.ts";
import {
  type ParliamentRequest,
  readHistory,
  readParliamentRequest,
} from "./request.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const auth = await requireAuth(req);
  if (!auth || auth.kind !== "user" || !auth.userId)
    return json(401, { error: "Unauthorized" });

  let body: ParliamentRequest;
  try {
    body = readParliamentRequest(await req.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const tenantId = String(body.tenant_id || "").trim();
  if (!tenantId) return json(400, { error: "tenant_id is required" });
  const sb = serviceClient();
  if (!(await userHasTenantAccess(sb, auth.userId, tenantId)))
    return json(403, { error: "Forbidden" });

  const action = String(body.action || "start");
  const conversationId = String(body.conversation_id || "");
  if (action === "cancel") {
    if (!conversationId)
      return json(400, { error: "conversation_id is required" });
    await cancelParliament(conversationId);
    return json(200, { ok: true, status: "idle" });
  }

  // Per-user Carmen permissions: every other action needs the parliament
  // grant, the same check agent-channel-send applies.
  const carmen = await resolveCarmenAgent(sb, tenantId);
  if (!carmen) return json(400, { error: "No Carmen agent" });
  const level = brainLevel(
    await loadCarmenAccessRow(sb, tenantId, carmen.id, auth.userId),
    BRAIN.parliament,
  );
  if (!level) return brainDenied("parliament");
  const limit = (text: string) => applyBrainLimit(level, text);

  if (action === "continue") {
    if (!conversationId)
      return json(400, { error: "conversation_id is required" });
    return json(200, await forceContinueParliament(conversationId));
  }
  if (action === "synthesize") {
    if (!conversationId)
      return json(400, { error: "conversation_id is required" });
    return json(200, await forceSynthesizeParliament(conversationId));
  }
  if (action === "clarify") {
    const provider = String(body.provider || "");
    const question = String(body.content || body.question || "").trim();
    if (!conversationId || !question)
      return json(400, { error: "conversation_id and content are required" });
    if (provider !== "cursor" && provider !== "grok")
      return json(400, { error: "clarify only supports cursor or grok" });
    return json(
      200,
      await clarifyParliamentSeat(conversationId, provider, limit(question)),
    );
  }

  const content = String(body.content || body.goal || "").trim();
  if (!content) return json(400, { error: "content is required" });
  const route = await loadRoute(sb, tenantId, {
    slug: "parliament",
    routeId:
      typeof body.brain_route_id === "string" ? body.brain_route_id : null,
  });
  if (!route) return json(400, { error: "parliament route missing" });
  const conv = await ensureConversation(sb, {
    conversationId: conversationId || null,
    tenantId,
    userId: auth.userId,
    agentId: carmen.id,
    route,
    title: content,
  });
  const result = await startParliament({
    tenantId,
    userId: auth.userId,
    agentId: carmen.id,
    conversationId: conv.id,
    route,
    content: limit(content),
    inputMode: "typed",
    idempotencyKey: String(body.idempotency_key || crypto.randomUUID()),
    history: readHistory(body.conversation_history),
  });
  return json(200, result);
});
