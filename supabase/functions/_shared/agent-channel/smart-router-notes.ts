/** "נתב חכם" side outputs: the reply when no brain fits, and the routing log. */
import { safeUsageEvent } from "../carmen/free-first/cost.ts";
import type {
  RoutingDecision,
  TaskDescriptor,
} from "../carmen/free-first/types.ts";
import type { DbClient } from "../supabase-clients.ts";
import { capabilitiesForProvider } from "./logic.ts";
import { insertMessage, logChannelAction } from "./store.ts";
import type { SendContext, SendResult } from "./types.ts";

/** Answers in the chat why no brain was picked, instead of failing silently. */
export async function explainNoModel(
  sb: DbClient,
  ctx: SendContext,
  decision: RoutingDecision,
): Promise<SendResult> {
  const text =
    decision.status === "approval_required"
      ? "מתאימים לבקשה הזו רק מוחות בתשלום, והנתב לא מפעיל מוח בתשלום לבד. בחרו אותו ישירות בבורר."
      : 'אין מוח חינמי שמותר לשלוח לו את הבקשה. בהגדרות המוחות סמנו מוח כ"חינמי" ו"מותר לשלוח מידע של לקוחות", או בחרו מוח אחר בבורר.';
  await insertMessage(sb, {
    tenant_id: ctx.tenantId,
    conversation_id: ctx.conversationId,
    role: "assistant",
    speaker: ctx.route.slug,
    channel: ctx.route.slug,
    content: text,
    metadata: {
      origin: "model",
      router: "free_first",
      reason: decision.reason,
    },
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
