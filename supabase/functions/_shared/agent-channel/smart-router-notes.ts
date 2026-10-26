/** "נתב חכם" side outputs: the routing log, and a reply when it cannot run. */
import { safeUsageEvent } from "../carmen/free-first/cost.ts";
import type { TaskDescriptor } from "../carmen/free-first/types.ts";
import type { DbClient } from "../supabase-clients.ts";
import { capabilitiesForProvider } from "./logic.ts";
import { insertMessage, logChannelAction } from "./store.ts";
import type { SendContext, SendResult } from "./types.ts";

/**
 * An image needs Carmen's own engine (the free brains cannot see it), and this
 * user has no grant for it: say so on the router's thread.
 */
export async function explainVisionNeedsCarmen(
  sb: DbClient,
  ctx: SendContext,
): Promise<SendResult> {
  const text =
    "כדי לקרוא תמונות צריך את המוח הראשי של כרמן, ואין לך הרשאה אליו. בקשו ממנהל החשבון הרשאה בהגדרות → הרשאות.";
  await insertMessage(sb, {
    tenant_id: ctx.tenantId,
    conversation_id: ctx.conversationId,
    role: "assistant",
    speaker: ctx.route.slug,
    channel: ctx.route.slug,
    content: text,
    metadata: { origin: "model", router: "free_first", reason: "needs_vision" },
  });
  return {
    ok: true,
    kind: "model",
    speaker: ctx.route.slug,
    conversation_id: ctx.conversationId,
    status: "idle",
    stream: false,
    accepted_message: text,
    external_url: null,
    capabilities: capabilitiesForProvider("model"),
    inline_reply: text,
  };
}

/** One agent_action_log row per routing decision; metrics only, no content. */
export async function logRouting(
  sb: DbClient,
  ctx: SendContext,
  task: TaskDescriptor,
  provider: string,
  reason: string,
  modelId = "",
) {
  await logChannelAction(sb, {
    tenantId: ctx.tenantId,
    agentId: ctx.agentId,
    action: "channel_route_smart",
    details: safeUsageEvent({
      tenantId: ctx.tenantId,
      requestId: ctx.idempotencyKey,
      taskKind: task.kind,
      modelId,
      provider,
      status: provider === "none" ? "skipped" : "success",
      reason,
    }),
  });
}
