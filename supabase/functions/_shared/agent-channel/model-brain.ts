/**
 * Chat-model brains connected from Carmen settings (route_type "model").
 * They run as Carmen: the client streams run-ai-agent with the route's slug,
 * and run-ai-agent runs Carmen's loop (tools, data, permissions) on the
 * brain's own endpoint and key (_shared/carmen/brain-engine).
 */
import { brainStreamResult } from "./logic.ts";
import type { SendContext, SendResult } from "./types.ts";

export function launchModelBrain(ctx: SendContext): SendResult {
  return brainStreamResult(ctx.conversationId, ctx.route.slug);
}
