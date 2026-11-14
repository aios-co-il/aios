/**
 * The manager round's model calls follow Carmen's own chain (AIO-594): the
 * engine of the tenant's Carmen agent (findCarmenAgent) with the key its own
 * "llm" integration holds for that provider, then the tenant's OpenRouter
 * brain under the rules of Carmen's last link (openRouterTail: active route,
 * marked free and approved for client data). A refused or exhausted link
 * (movesToNextLink) moves the call to the next one; a timeout or other error
 * ends it. With no link (no own key, a Manus engine, no eligible OpenRouter
 * brain) there is no call and the markers decide; a tenant's client text never
 * goes through another tenant's key. The chain is read once per run; each ask
 * is JSON mode, its links share one `timeoutMs` window, and each answer is
 * logged to ai_usage_log under the tenant and source.
 */
import { estimateOpenAICostUSD, logAiUsage } from "../_shared/ai.ts";
import { movesToNextLink } from "../_shared/carmen/brain-engine/openrouter-tail.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { loadChain, type ModelTarget } from "./model-chain.ts";

export type { ModelTarget };

/** One model call: its JSON text (null on failure) and its cost. */
export type AskModel = (
  prompt: string,
) => Promise<{ text: string | null; costUsd: number }>;

export type TenantModelDeps = {
  /** The tenant's chain, Carmen's engine first; empty when it has none to call. */
  targets: () => Promise<Array<ModelTarget>>;
  fetch: typeof fetch;
  log: typeof logAiUsage;
};

/** The tenant's metered JSON call on Carmen's brain. */
export function tenantModelAsker(
  db: DbClient,
  tenantId: string,
  call: { source: string; timeoutMs: number },
  deps: TenantModelDeps = liveDeps(db, tenantId),
): AskModel {
  let chain: Promise<Array<ModelTarget>> | undefined;
  return async (prompt) => {
    // One window for the whole chain: a refused link leaves the next one only
    // what is left of it, so the call never outruns the round's reservation.
    const signal = AbortSignal.timeout(call.timeoutMs);
    chain ??= deps.targets();
    for (const target of await chain) {
      const answer = await askTarget(
        target,
        prompt,
        { tenantId, source: call.source, signal },
        deps,
      );
      if (answer !== "next") {
        return answer;
      }
    }
    return { text: null, costUsd: 0 };
  };
}

/** The live target lookup, fetch and usage log. */
function liveDeps(db: DbClient, tenantId: string): TenantModelDeps {
  return {
    targets: () => loadChain(db, tenantId),
    fetch: (...args) => fetch(...args),
    log: logAiUsage,
  };
}

/**
 * One JSON-mode call: its answer, "next" when the link refused or ran out
 * (movesToNextLink, below 500), or null text on a server error, any other
 * error or the shared timeout.
 */
async function askTarget(
  target: ModelTarget,
  prompt: string,
  call: { tenantId: string; source: string; signal: AbortSignal },
  deps: TenantModelDeps,
): Promise<{ text: string | null; costUsd: number } | "next"> {
  try {
    const response = await deps.fetch(target.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: target.model,
        messages: [{ role: "user", content: prompt }],
        ...(target.jsonMode
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: call.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(
        `[carmen-manager-round] model ${target.model} answered ${response.status} (${call.source})`,
      );
      // A server error ends the call even when its body names a quota.
      return response.status < 500 &&
        movesToNextLink(response.status, detail, false)
        ? "next"
        : { text: null, costUsd: 0 };
    }
    const body = await response.json();
    const costUsd = meter(body, target.model, call, deps);
    return { text: body?.choices?.[0]?.message?.content ?? null, costUsd };
  } catch (error) {
    console.error(
      `[carmen-manager-round] model ${target.model} call failed (${call.source}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return { text: null, costUsd: 0 };
  }
}

/** Logs the call's usage under the tenant and returns its cost (0 when unpriced). */
function meter(
  body: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  model: string,
  call: { tenantId: string; source: string },
  deps: TenantModelDeps,
): number {
  const tokensIn = body?.usage?.prompt_tokens ?? 0;
  const tokensOut = body?.usage?.completion_tokens ?? 0;
  const cost = estimateOpenAICostUSD(model, tokensIn, tokensOut);
  deps.log({
    source: call.source,
    model,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    cost_usd: cost,
    tenant_id: call.tenantId,
  });
  return cost ?? 0;
}
