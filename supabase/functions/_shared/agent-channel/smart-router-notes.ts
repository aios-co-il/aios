/** "נתב חכם" routing log. */
import { safeUsageEvent } from "../carmen/free-first/cost.ts";
import type { TaskDescriptor } from "../carmen/free-first/types.ts";
import type { DbClient } from "../supabase-clients.ts";
import { logChannelAction } from "./store.ts";
import type { SendContext } from "./types.ts";

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
