/**
 * One chat completion against an OpenAI-compatible API (OpenAI, Anthropic,
 * Gemini, xAI, OpenRouter, custom). Used by model brains and by the
 * connection test in carmen-brain-connections.
 */
import type {
  BrainProfile,
  ChatMessage,
} from "../carmen/brain-connections/types.ts";
import {
  chatCompletionsUrl,
  isPrivateHost,
} from "../carmen/brain-connections/url.ts";

const TIMEOUT_MS = 90_000;

/** A failed call; status 0 means the request timed out. */
export class ModelApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The reply text. Throws ModelApiError with the provider's error text. */
export async function callChatModel(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  profile: BrainProfile;
}): Promise<string> {
  const url = chatCompletionsUrl(args.baseUrl);
  await assertPublicTarget(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
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
      // A redirect could point at an internal host, so it is never followed.
      redirect: "manual",
    });
    if (
      resp.type === "opaqueredirect" ||
      (resp.status >= 300 && resp.status < 400)
    )
      throw new ModelApiError(
        400,
        "Model API redirected. Use the final address as the base URL.",
      );
    const raw = await resp.text();
    if (!resp.ok)
      throw new ModelApiError(
        resp.status,
        `Model API ${resp.status}: ${providerError(raw)}`,
      );
    return replyText(raw);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new ModelApiError(0, "Model API timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Refuses a host that is, or resolves to, a private or loopback address, so a
 * tenant manager cannot point the server at internal services.
 */
export async function assertPublicTarget(url: string): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHost(host))
    throw new ModelApiError(400, "Base URL must be a public host");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return;
  const resolveDns = (
    Deno as { resolveDns?: (q: string, t: string) => Promise<string[]> }
  ).resolveDns;
  if (typeof resolveDns !== "function") return;
  const addrs = (
    await Promise.all([
      resolveDns(host, "A").catch(() => [] as string[]),
      resolveDns(host, "AAAA").catch(() => [] as string[]),
    ])
  ).flat();
  if (addrs.some(isPrivateHost))
    throw new ModelApiError(400, "Base URL must be a public host");
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
