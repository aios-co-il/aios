/**
 * Chat-model brains connected from Carmen settings (route_type "model").
 * One synchronous chat completion per message; the reply is stored in the
 * conversation and returned inline. "נתב חכם" reuses answerWithConnection.
 */
import { buildModelMessages } from "../carmen/brain-connections/messages.ts";
import { connectionSecret } from "../carmen/brain-connections/overrides.ts";
import { sanitizeProfile } from "../carmen/brain-connections/profile.ts";
import { type DbClient, serviceClient } from "../supabase-clients.ts";
import { callChatModel, ModelApiError } from "./chat-model-api.ts";
import { acceptedMessageFor, capabilitiesForProvider } from "./logic.ts";
import { insertMessage, logChannelAction } from "./store.ts";
import type { SendContext, SendResult } from "./types.ts";

export type ModelConnection = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  model: string;
  profile: unknown;
};

/** Asks the route's own model and stores its reply in the conversation. */
export async function launchModelBrain(ctx: SendContext): Promise<SendResult> {
  const sb = serviceClient();
  const conn = await loadModelConnection(sb, ctx);
  try {
    return await answerWithConnection(sb, ctx, conn);
  } catch (e) {
    throw new Error(`${conn.name}: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * One reply from `conn`, stored on the route's thread (channel = route slug)
 * and spoken as the model (speaker = connection slug). Throws ModelApiError.
 */
export async function answerWithConnection(
  sb: DbClient,
  ctx: SendContext,
  conn: ModelConnection,
  routing?: Record<string, unknown>,
): Promise<SendResult> {
  const apiKey = await connectionSecret(sb, conn.id);
  if (!apiKey)
    throw new ModelApiError(401, "אין מפתח API. הוסיפו מפתח בהגדרות המוחות.");
  const profile = sanitizeProfile(conn.profile);
  let answer: string;
  try {
    answer = await callChatModel({
      baseUrl: conn.base_url,
      apiKey,
      model: conn.model,
      profile,
      messages: buildModelMessages({
        profile,
        history: ctx.history,
        content: ctx.content,
      }),
    });
  } catch (e) {
    await logModelSend(
      sb,
      ctx,
      conn,
      e instanceof Error ? e.message : String(e),
    );
    throw e;
  }
  await logModelSend(sb, ctx, conn, null);

  await insertMessage(sb, {
    tenant_id: ctx.tenantId,
    conversation_id: ctx.conversationId,
    role: "assistant",
    speaker: conn.slug,
    channel: ctx.route.slug,
    content: answer,
    metadata: {
      origin: "model",
      delivery_mode: "text",
      connection_id: conn.id,
      model: conn.model,
      ...(routing ? { routing } : {}),
    },
  });
  return {
    ok: true,
    kind: "model",
    speaker: conn.slug,
    conversation_id: ctx.conversationId,
    status: "idle",
    stream: false,
    accepted_message: acceptedMessageFor("model"),
    external_url: null,
    capabilities: capabilitiesForProvider("model"),
    inline_reply: answer,
  };
}

/** The route's chat-model connection in this tenant, fully configured. */
async function loadModelConnection(
  sb: DbClient,
  ctx: SendContext,
): Promise<ModelConnection> {
  const notReady = `${ctx.route.label}: החיבור לא מוגדר עד הסוף (כתובת או מודל חסרים).`;
  if (!ctx.route.connection_id) throw new Error(notReady);
  const { data, error } = await sb
    .from("carmen_brain_connections")
    .select("id, slug, name, base_url, model, profile")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", ctx.route.connection_id)
    .eq("kind", "chat_model")
    .maybeSingle();
  if (error) throw new Error(`Brain connection read failed: ${error.message}`);
  if (!data?.base_url || !data.model) throw new Error(notReady);
  return { ...data, base_url: data.base_url, model: data.model };
}

/** One agent_action_log row per model call, success or failure. */
async function logModelSend(
  sb: DbClient,
  ctx: SendContext,
  conn: ModelConnection,
  error: string | null,
) {
  await logChannelAction(sb, {
    tenantId: ctx.tenantId,
    agentId: ctx.agentId,
    action: "channel_send_model",
    details: {
      conversation_id: ctx.conversationId,
      route: ctx.route.slug,
      connection_id: conn.id,
      slug: conn.slug,
      model: conn.model,
      ok: !error,
    },
    status: error ? "error" : "success",
    error,
  });
}
