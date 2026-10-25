import {
  type ChannelProvider,
  isSmartRouter,
  type SendContext,
  type SendResult,
} from "./types.ts";
import { internalStreamResult } from "./logic.ts";
import {
  launchChatgpt,
  launchClaude,
  launchCloudDirect,
  launchWorkspaceAgent,
} from "./direct.ts";
import { launchModelBrain } from "./model-brain.ts";
import { launchSmartRouter } from "./smart-router.ts";
import { startParliament } from "./parliament.ts";

export async function dispatchSend(ctx: SendContext): Promise<SendResult> {
  const kind: ChannelProvider =
    ctx.route.route_type === "parliament"
      ? "parliament"
      : ctx.route.route_type === "model"
        ? "model"
        : ((ctx.route.provider ||
            ctx.route.slug ||
            "internal") as ChannelProvider);

  if (kind === "internal") return internalStreamResult(ctx.conversationId);

  if (kind === "cursor" || kind === "grok") return launchCloudDirect(ctx, kind);
  if (kind === "codex") return launchWorkspaceAgent(ctx, "codex");
  if (kind === "claude") return launchClaude(ctx);
  if (kind === "chatgpt") return launchChatgpt(ctx);
  if (kind === "parliament") return startParliament(ctx);
  if (kind === "model")
    return isSmartRouter(ctx.route)
      ? launchSmartRouter(ctx)
      : launchModelBrain(ctx);
  throw new Error(`Unknown brain route: ${kind}`);
}
