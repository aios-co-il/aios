/** "בדיקת חיבור": one tiny completion against a model brain. */
import { connectionSecret } from "../_shared/carmen/brain-connections/overrides.ts";
import { callChatModel } from "../_shared/agent-channel/chat-model-api.ts";
import {
  type ActionContext,
  has,
  HttpError,
  requireApiKey,
  requireBaseUrl,
  requireModel,
  text,
} from "./request.ts";
import { loadConnection } from "./state.ts";

/** One tiny completion with the saved key, or with the form's values. */
export async function testModel(ctx: ActionContext) {
  const target = has(ctx.body, "connection_id")
    ? await savedTarget(ctx)
    : {
        baseUrl: requireBaseUrl(text(ctx.body, "base_url")),
        model: requireModel(ctx.body),
        apiKey: requireApiKey(ctx.body),
      };
  try {
    const reply = await callChatModel({
      ...target,
      messages: [{ role: "user", content: "Reply with the word OK." }],
      profile: { max_tokens: 16 },
    });
    return { ok: true, reply: reply.slice(0, 80) };
  } catch (e) {
    // The provider's own message (bad key, unknown model) is what the user needs.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Endpoint, model and Vault key of a saved connection. */
async function savedTarget(ctx: ActionContext) {
  const conn = await loadConnection(ctx, "chat_model");
  const apiKey = await connectionSecret(ctx.sb, conn.id);
  if (!apiKey) throw new HttpError(400, "No API key saved");
  return { baseUrl: conn.base_url ?? "", model: conn.model ?? "", apiKey };
}
