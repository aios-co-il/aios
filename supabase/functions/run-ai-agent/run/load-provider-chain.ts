import type { ProviderChainState } from "./loop-contracts.ts";
import type { RunState } from "./state.ts";
import type { LLMTarget } from "../llm/contracts.ts";
import { buildLLMChain } from "../llm/chain.ts";
import { lazyBrainTail } from "../../_shared/carmen/brain-engine/openrouter-tail.ts";

/** Initializes the same internal/connected chain before round execution. */
export async function loadProviderChain(
  run: RunState,
): Promise<ProviderChainState> {
  const isolatedChatModel =
    run.pinSkillsOnly &&
    (run.model === "manus/manus-1" || run.model === "manus-1")
      ? "google/gemini-3-flash-preview"
      : run.model;
  if (isolatedChatModel !== run.model) {
    console.log(
      `[AGENT] pin_skills_only: remapping ${run.model} → ${isolatedChatModel} for isolated chat`,
    );
  }
  // A picked model brain runs this same loop on its own endpoint and key;
  // "נתב חכם" may continue on Carmen's own engine when its brains fail.
  const runsInternal =
    !run.input.brainEngine || run.input.brainEngine.fallbackInternal;
  const llmChain: Array<LLMTarget> = run.input.brainEngine
    ? [
        ...run.input.brainEngine.targets,
        ...(run.input.brainEngine.fallbackInternal
          ? await buildLLMChain(
              run.supabase,
              run.agent.tenant_id,
              isolatedChatModel,
            )
          : []),
      ]
    : await buildLLMChain(run.supabase, run.agent.tenant_id, isolatedChatModel);
  // Carmen's own engine ends on the tenant's OpenRouter brain, read only once the chain
  // runs out, so a missing or refused provider key continues there instead of failing.
  const extendChain = lazyBrainTail<LLMTarget>(
    llmChain,
    runsInternal ? run.input.internalTail : undefined,
  );
  if (llmChain.length === 0) {
    await extendChain();
  }
  if (llmChain.length === 0) {
    throw new Error("לא מוגדר אף מפתח מודל AI פעיל באינטגרציית מודלי AI");
  }
  const chain: ProviderChainState = { llmChain, activeIdx: 0, extendChain };
  run.llm = llmChain[chain.activeIdx];
  console.log(`[AGENT] LLM chain: ${llmChain.map((c) => c.label).join(" → ")}`);
  return chain;
}
