/**
 * Chat-model brains connected from Carmen settings (route_type "model").
 * One synchronous chat completion per message; the reply is stored in the
 * conversation and returned inline.
 */
import { buildModelMessages } from "../carmen/brain-connections/messages.ts";
import { connectionSecret } from "../carmen/brain-connections/overrides.ts";
import { sanitizeProfile } from "../carmen/brain-connections/profile.ts";
import { type DbClient, serviceClient } from "../supabase-clients.ts";
import { callChatModel } from "./chat-model-api.ts";
import { acceptedMessageFor, capabilitiesForProvider } from "./logic.ts";
import { insertMessage, logChannelAction } from "./store.ts";
import type { SendContext, SendResult } from "./types.ts";

/** Asks the route's model and stores its reply in the conversation. */
export async function launchModelBrain(ctx: SendContext): Promise<SendResult> {
  const sb = serviceClient();
  const conn = await loadModelConnection(sb, ctx);
  const apiKey = await connectionSecret(sb, conn.id);
  if (!apiKey)
    throw new Error(`${conn.name}: אין מפתח API. הוסיפו מפתח בהגדרות המוחות.`);

  const profile = sanitizeProfile(conn.profile);
  const outcome = await askModel({
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
  await logModelSend(sb, ctx, conn, outcome.error);
  if (outcome.error) throw new Error(`${conn.name}: ${outcome.error}`);

  await insertMessage(sb, {
    tenant_id: ctx.tenantId,
    conversation_id: ctx.conversationId,
    role: "assistant",
    speaker: conn.slug,
    channel: conn.slug,
    content: outcome.answer,
    metadata: {
      origin: "model",
      delivery_mode: "text",
      connection_id: conn.id,
      model: conn.model,
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
    inline_reply: outcome.answer,
  };
}

type ModelConnection = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  model: string;
  profile: unknown;
};

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

/** The model's answer, or the error text to log and show. */
async function askModel(
  args: Parameters<typeof callChatModel>[0],
): Promise<{ answer: string; error: null } | { answer: ""; error: string }> {
  try {
    return { answer: await callChatModel(args), error: null };
  } catch (e) {
    return { answer: "", error: e instanceof Error ? e.message : String(e) };
  }
}

/** One agent_action_log row per model send, success or failure. */
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
      connection_id: conn.id,
      slug: conn.slug,
      model: conn.model,
      ok: !error,
    },
    status: error ? "error" : "success",
    error,
  });
}
