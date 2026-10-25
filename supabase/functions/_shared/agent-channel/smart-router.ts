/**
 * "נתב חכם": picks a connected chat-model brain per message, free first.
 * Tasks that need tools, approvals or images go to Carmen's own brain, which
 * has them. A paid model never runs on its own; there is no budget ledger yet.
 */
import { classifyCarmenTask } from "../carmen/free-first/classifier.ts";
import {
  candidatesFromConnections,
  failureKindFor,
} from "../carmen/free-first/candidates.ts";
import { planSafeFailover } from "../carmen/free-first/failover.ts";
import { routeCarmenTask } from "../carmen/free-first/router.ts";
import type {
  RoutingDecision,
  TaskDescriptor,
} from "../carmen/free-first/types.ts";
import { sanitizeProfile } from "../carmen/brain-connections/profile.ts";
import { type DbClient, serviceClient } from "../supabase-clients.ts";
import { ModelApiError } from "./chat-model-api.ts";
import { internalStreamResult } from "./logic.ts";
import { answerWithConnection, type ModelConnection } from "./model-brain.ts";
import { explainNoModel, logRouting } from "./smart-router-notes.ts";
import type { SendContext, SendResult } from "./types.ts";

export async function launchSmartRouter(ctx: SendContext): Promise<SendResult> {
  const sb = serviceClient();
  // Client data cannot be ruled out from the text, so only brains the owner
  // approved for it are eligible.
  const task = classifyCarmenTask(ctx.content, {
    hasAttachments: !!ctx.attachments?.length,
    containsClientData: true,
  });
  if (
    task.needsToolCalling ||
    task.requiresActionApproval ||
    task.needsVision
  ) {
    await logRouting(sb, ctx, task, "carmen", "needs_carmen_tools");
    return internalStreamResult(ctx.conversationId);
  }

  const conns = await loadRoutableConnections(sb, ctx.tenantId);
  const decision = routeCarmenTask(
    task,
    { mode: "free_first", allowAutomaticPremium: false },
    candidatesFromConnections(
      conns.map((c) => ({ ...c, profile: sanitizeProfile(c.profile) })),
    ),
  );
  if (decision.status !== "ready" || !decision.modelId) {
    await logRouting(sb, ctx, task, "none", decision.reason);
    return explainNoModel(sb, ctx, decision);
  }
  return answerWithFailover(sb, ctx, task, decision, conns);
}

/** Tries the chosen brain, then free fallbacks for retryable failures. */
async function answerWithFailover(
  sb: DbClient,
  ctx: SendContext,
  task: TaskDescriptor,
  decision: RoutingDecision,
  conns: Array<ModelConnection & { provider_preset: string | null }>,
): Promise<SendResult> {
  const attempted: string[] = [];
  let modelId: string | null = decision.modelId;
  while (modelId) {
    const conn = conns.find((c) => c.id === modelId);
    if (!conn) break;
    attempted.push(conn.id);
    try {
      const result = await answerWithConnection(sb, ctx, conn, {
        router: "free_first",
        task: task.kind,
        reason: decision.reason,
        attempts: attempted.length,
      });
      await logRouting(
        sb,
        ctx,
        task,
        conn.provider_preset ?? "custom",
        decision.reason,
        conn.model,
      );
      return result;
    } catch (e) {
      const status = e instanceof ModelApiError ? e.status : 500;
      const next = planSafeFailover(decision, failureKindFor(status), {
        completedToolCalls: 0,
        inferenceOnly: true,
        attemptedModelIds: attempted,
      });
      if (next.kind !== "retry_model")
        throw new Error(`${conn.name}: ${e instanceof Error ? e.message : e}`);
      modelId = next.modelId;
    }
  }
  throw new Error("נתב חכם: אין מוח זמין");
}

/** Chat-model connections of this tenant with endpoint and model set. */
async function loadRoutableConnections(sb: DbClient, tenantId: string) {
  const { data, error } = await sb
    .from("carmen_brain_connections")
    .select(
      "id, slug, name, base_url, model, profile, provider_preset, key_last4",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", "chat_model")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Brain connections read failed: ${error.message}`);
  return (data ?? []).flatMap((c) =>
    c.base_url && c.model
      ? [{ ...c, base_url: c.base_url, model: c.model }]
      : [],
  );
}
