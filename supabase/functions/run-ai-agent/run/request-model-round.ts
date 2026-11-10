import type { RunState } from "./state.ts";
import { movesToNextLink } from "../../_shared/carmen/brain-engine/openrouter-tail.ts";
import { recordProviderFailover } from "../llm/failover.ts";
import { failoverReason } from "../../_shared/carmen/brain-engine/openrouter-tail.ts";
import { connectedBrainHint } from "../llm/connection-hint.ts";
import { buildRoundPayload } from "./model-round-payload.ts";
import type { ProviderChainState } from "./loop-contracts.ts";
/** Retries the same round on the next allowed provider before consuming another round. */
export async function requestModelRound(
  run: RunState,
  chain: ProviderChainState,
  round: number,
): Promise<Response> {
  let res: Response;
  while (true) {
    const payload = buildRoundPayload(run, round);
    console.log(
      `[AGENT] Round ${round + 1}/${run.maxRounds}, provider=${run.llm.label}`,
    );
    res = await fetch(run.llm.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${run.llm.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // A tenant-set endpoint may not bounce the request (and key) elsewhere.
      redirect: run.llm.connectionId ? "manual" : "follow",
    });
    // A connected brain's 200 must be a chat completion; anything else
    // counts as that brain failing, so the chain can move on.
    const malformed =
      res.ok && !!run.llm.connectionId
        ? await res
            .clone()
            .json()
            .then((d) => !d?.choices?.[0]?.message)
            .catch(() => true)
        : false;
    if (res.ok && !malformed) {
      break;
    }
    const err = malformed
      ? "המוח החזיר תשובה לא תקינה (בלי הודעה)."
      : await res.text();
    console.error(
      `[AGENT] AI error ${res.status} on ${run.llm.label}:`,
      err.substring(0, 200),
    );
    // A 429, a refused key (401/402/403), a body signalling exhausted balance/quota or a
    // model the endpoint cannot serve (not a chat model / model_not_found) triggers
    // failover. A connected brain may also fail on size, model or auth; any failure moves
    // on, and the chain holds only what this brain plan allowed.
    if (
      movesToNextLink(res.status, err, !!run.llm.connectionId) &&
      (chain.activeIdx < chain.llmChain.length - 1 ||
        (await chain.extendChain()))
    ) {
      const from = run.llm.label;
      chain.activeIdx++;
      run.llm = chain.llmChain[chain.activeIdx];
      recordProviderFailover(
        run.supabase,
        run.agent.tenant_id,
        from,
        run.llm.label,
        failoverReason(res.status, err),
      ).catch(() => {});
      continue; // retry the same round on the next provider
    }
    if (run.llm.connectionId) {
      throw new Error(
        `${run.llm.label}: ${res.status} ${connectedBrainHint(res.status, err)}`,
      );
    }
    if (res.status === 429) {
      throw new Error("מגבלת קצב. נסה שוב.");
    }
    throw new Error(`AI error: ${res.status} ${err}`);
  }
  return res;
}
