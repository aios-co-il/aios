/**
 * Chat-model brains connected from Carmen settings (route_type "model").
 * One synchronous OpenAI-compatible chat completion per message; the reply is
 * stored in the conversation and returned inline.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  type BrainProfile,
  buildModelMessages,
  type ChatMessage,
  chatCompletionsUrl,
  sanitizeProfile,
} from "../carmen/brain-connections.ts";
import { connectionSecret } from "./brain-env.ts";
import { acceptedMessageFor, capabilitiesForProvider } from "./logic.ts";
import { insertMessage, logChannelAction, serviceClient } from "./store.ts";
import type { SendContext, SendResult } from "./types.ts";

const TIMEOUT_MS = 90_000;

export type ModelConnection = {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  base_url: string | null;
  model: string | null;
  profile: BrainProfile | null;
  provider_preset: string | null;
};

export async function loadModelConnection(
  sb: SupabaseClient,
  tenantId: string,
  connectionId: string | null,
): Promise<ModelConnection | null> {
  if (!connectionId) return null;
  const { data } = await sb
    .from("carmen_brain_connections")
    .select(
      "id, tenant_id, slug, name, base_url, model, profile, provider_preset",
    )
    .eq("id", connectionId)
    .eq("tenant_id", tenantId)
    .eq("kind", "chat_model")
    .maybeSingle();
  return (data as ModelConnection | null) ?? null;
}

/** One chat completion. Throws with the provider's error text on failure. */
export async function callChatModel(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  profile: BrainProfile;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
  };
  if (args.profile.temperature !== undefined)
    body.temperature = args.profile.temperature;
  if (args.profile.max_tokens !== undefined)
    body.max_tokens = args.profile.max_tokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(chatCompletionsUrl(args.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aios.co.il",
        "X-Title": "AIOS Carmen",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await resp.text();
    if (!resp.ok) {
      let detail = raw.slice(0, 300);
      try {
        const parsed = JSON.parse(raw);
        detail =
          parsed?.error?.message ||
          parsed?.[0]?.error?.message ||
          parsed?.message ||
          detail;
      } catch {
        /* keep raw */
      }
      throw new Error(`Model API ${resp.status}: ${detail}`);
    }
    const data = JSON.parse(raw);
    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((p: { text?: string }) => p?.text ?? "").join("")
      : String(content ?? "");
    if (!text.trim()) throw new Error("Model API returned an empty reply");
    return text.trim();
  } catch (e) {
    if ((e as Error)?.name === "AbortError")
      throw new Error("Model API timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function launchModelBrain(ctx: SendContext): Promise<SendResult> {
  const sb = serviceClient();
  const conn = await loadModelConnection(
    sb,
    ctx.tenantId,
    ctx.route.connection_id,
  );
  if (!conn || !conn.base_url || !conn.model)
    throw new Error(
      `${ctx.route.label}: החיבור לא מוגדר עד הסוף (כתובת או מודל חסרים).`,
    );
  const apiKey = await connectionSecret(sb, conn.id);
  if (!apiKey)
    throw new Error(`${conn.name}: אין מפתח API. הוסיפו מפתח בהגדרות המוחות.`);

  const profile = sanitizeProfile(conn.profile);
  const messages = buildModelMessages({
    profile,
    history: ctx.history,
    content: ctx.content,
  });

  let answer = "";
  let error: string | null = null;
  try {
    answer = await callChatModel({
      baseUrl: conn.base_url,
      apiKey,
      model: conn.model,
      messages,
      profile,
    });
  } catch (e) {
    error = String((e as Error)?.message ?? e);
  }

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
  if (error) throw new Error(`${conn.name}: ${error}`);

  await insertMessage(sb, {
    tenant_id: ctx.tenantId,
    conversation_id: ctx.conversationId,
    role: "assistant",
    speaker: conn.slug,
    channel: conn.slug,
    content: answer,
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
    inline_reply: answer,
  };
}
