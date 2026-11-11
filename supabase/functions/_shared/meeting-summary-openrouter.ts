// Meeting summaries through OpenRouter with the tenant's own key (Carmen
// settings → brains). A strong long-context model reads the whole transcript in
// one pass, so a long meeting is not cut into chunks first.
import { logAiUsage } from "./ai.ts";
import type { SecretClient } from "./carmen/brain-connections/overrides.ts";
import { tenantOpenRouterKey } from "./creative/openrouterImage.ts";
import {
  buildSummaryUserPrompt,
  MEETING_SUMMARY_SYSTEM_PROMPT,
} from "./meeting-summary-prompts.ts";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MEETING_SUMMARY_MODEL = "anthropic/claude-opus-5.5";
// Hebrew takes many tokens per word: 8,000 cut every detailed summary short.
const MAX_SUMMARY_TOKENS = 16_000;
// A summary longer than one reply continues in the next one, up to this many replies.
const MAX_SUMMARY_PARTS = 4;
const CONTINUE_PROMPT =
  "המשך את הסיכום בדיוק מהמקום שבו נעצרת, בלי לחזור על מה שכבר כתבת ובלי הקדמה.";

export interface OpenRouterSummaryInput {
  apiKey: string;
  tenantId: string;
  transcript: string;
  recordingInfo: string;
  focusPrompt: string;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface SummaryPart {
  content: string;
  stoppedAtCap: boolean;
}

/**
 * The full summary of the full transcript. When a reply stops at the token cap,
 * the model is asked to continue from where it stopped and the parts are joined,
 * so the saved summary is never cut off. Throws on a provider error.
 */
export async function summarizeWithOpenRouter(
  input: OpenRouterSummaryInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const model = meetingSummaryModel();
  const messages: Array<ChatMessage> = [
    { role: "system", content: MEETING_SUMMARY_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildSummaryUserPrompt(
        input.transcript,
        input.recordingInfo,
        input.focusPrompt,
      ),
    },
  ];
  const parts: Array<string> = [];
  for (let round = 0; round < MAX_SUMMARY_PARTS; round++) {
    const part = await requestSummaryPart(input, model, messages, fetchImpl);
    parts.push(part.content);
    if (!part.stoppedAtCap) {
      return parts.join("");
    }
    messages.push(
      { role: "assistant", content: part.content },
      { role: "user", content: CONTINUE_PROMPT },
    );
  }
  throw new Error(
    `OpenRouter ${model} did not finish the summary in ${MAX_SUMMARY_PARTS} replies`,
  );
}

/** One reply from OpenRouter, with its usage logged; throws on a provider error. */
async function requestSummaryPart(
  input: OpenRouterSummaryInput,
  model: string,
  messages: Array<ChatMessage>,
  fetchImpl: typeof fetch,
): Promise<SummaryPart> {
  const res = await fetchImpl(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Carmen Marketing OS",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: MAX_SUMMARY_TOKENS,
      messages,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`OpenRouter ${model} returned ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`OpenRouter ${model} returned no summary`);
  }
  logAiUsage({
    source: "meeting-summary",
    model,
    tokens_in: data?.usage?.prompt_tokens ?? null,
    tokens_out: data?.usage?.completion_tokens ?? null,
    cost_usd: typeof data?.usage?.cost === "number" ? data.usage.cost : null,
    tenant_id: input.tenantId,
  });
  return { content, stoppedAtCap: choice?.finish_reason === "length" };
}

/** The `MEETING_SUMMARY_MODEL` secret when set, otherwise the default model. */
export function meetingSummaryModel(): string {
  return (
    Deno.env.get("MEETING_SUMMARY_MODEL")?.trim() ||
    DEFAULT_MEETING_SUMMARY_MODEL
  );
}

/**
 * The tenant's OpenRouter key for summaries, or "" when it has none. A failed
 * lookup is logged and falls back to the default summary model.
 */
export async function tenantSummaryKey(
  sb: SecretClient,
  tenantId: string,
): Promise<string> {
  try {
    return await tenantOpenRouterKey(sb, tenantId);
  } catch (err) {
    console.error(
      "[meeting-summary] OpenRouter key lookup failed",
      err instanceof Error ? err.message : err,
    );
    return "";
  }
}
