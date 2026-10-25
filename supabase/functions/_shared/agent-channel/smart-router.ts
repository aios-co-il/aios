/**
 * "נתב חכם": runs Carmen's loop on the free brains the owner approved for
 * client data, then on Carmen's own engine (_shared/carmen/brain-engine).
 * Images go straight to Carmen's own engine, since the free models here
 * cannot see them. A paid brain never runs unless the user picked it.
 */
import { classifyCarmenTask } from "../carmen/free-first/classifier.ts";
import { serviceClient } from "../supabase-clients.ts";
import { brainStreamResult, internalStreamResult } from "./logic.ts";
import { explainVisionNeedsCarmen, logRouting } from "./smart-router-notes.ts";
import type { SendContext, SendResult } from "./types.ts";

export async function launchSmartRouter(ctx: SendContext): Promise<SendResult> {
  const sb = serviceClient();
  const task = classifyCarmenTask(ctx.content, {
    hasAttachments: !!ctx.attachments?.length,
    containsClientData: true,
  });
  if (task.needsVision) {
    if (ctx.brainAllowed && !ctx.brainAllowed("internal")) {
      await logRouting(sb, ctx, task, "none", "internal_not_allowed");
      return explainVisionNeedsCarmen(sb, ctx);
    }
    await logRouting(sb, ctx, task, "carmen", "needs_vision");
    return internalStreamResult(ctx.conversationId);
  }
  await logRouting(sb, ctx, task, "carmen_loop", "free_first_as_carmen");
  return brainStreamResult(ctx.conversationId, ctx.route.slug);
}
