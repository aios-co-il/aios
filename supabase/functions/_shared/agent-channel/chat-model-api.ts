/**
 * One chat completion against an OpenAI-compatible API (OpenAI, Anthropic,
 * Gemini, xAI, OpenRouter, custom). Used by model brains and by the
 * connection test in carmen-brain-connections.
 */
import type {
  BrainProfile,
  ChatMessage,
} from "../carmen/brain-connections/types.ts";
import { chatCompletionsUrl } from "../carmen/brain-connections/url.ts";

const TIMEOUT_MS = 90_000;

/** The reply text. Throws with the provider's error text on failure. */
export async function callChatModel(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  profile: BrainProfile;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(chatCompletionsUrl(args.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter attributes traffic by these; other providers ignore them.
        "HTTP-Referer": "https://aios.co.il",
        "X-Title": "AIOS Carmen",
      },
      body: JSON.stringify(requestBody(args)),
      signal: controller.signal,
    });
    const raw = await resp.text();
    if (!resp.ok)
      throw new Error(`Model API ${resp.status}: ${providerError(raw)}`);
    return replyText(raw);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error("Model API timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Chat completions body; profile limits only when set. */
function requestBody(args: {
  model: string;
  messages: ChatMessage[];
  profile: BrainProfile;
}): Record<string, unknown> {
  return {
    model: args.model,
    messages: args.messages,
    ...(args.profile.temperature !== undefined
      ? { temperature: args.profile.temperature }
      : {}),
    ...(args.profile.max_tokens !== undefined
      ? { max_tokens: args.profile.max_tokens }
      : {}),
  };
}

/** The provider's error message, or the start of its raw body. */
function providerError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed?.error?.message ||
      parsed?.[0]?.error?.message ||
      parsed?.message ||
      raw.slice(0, 300)
    );
  } catch {
    return raw.slice(0, 300);
  }
}

/** First choice's text; content may be a string or a list of text parts. */
function replyText(raw: string): string {
  const content = JSON.parse(raw)?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content
        .map((p: unknown) =>
          p && typeof p === "object" && "text" in p ? String(p.text) : "",
        )
        .join("")
    : String(content ?? "");
  if (!text.trim()) throw new Error("Model API returned an empty reply");
  return text.trim();
}
