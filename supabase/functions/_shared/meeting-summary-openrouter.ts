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

export interface OpenRouterSummaryInput {
  apiKey: string;
  tenantId: string;
  transcript: string;
  recordingInfo: string;
  focusPrompt: string;
}

/** One summary of the full transcript; throws with the provider's status on failure. */
export async function summarizeWithOpenRouter(
  input: OpenRouterSummaryInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const model = meetingSummaryModel();
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
      messages: [
        { role: "system", content: MEETING_SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildSummaryUserPrompt(
            input.transcript,
            input.recordingInfo,
            input.focusPrompt,
          ),
        },
      ],
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
  // A summary that hit the cap ends mid-sentence; the caller falls back instead.
  if (choice?.finish_reason === "length") {
    throw new Error(
      `OpenRouter ${model} stopped at ${MAX_SUMMARY_TOKENS} tokens; summary is incomplete`,
    );
  }
  return content;
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
