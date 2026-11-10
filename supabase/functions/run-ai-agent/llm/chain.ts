import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { LLMTarget } from "./contracts.ts";
import { resolveModelId } from "../../_shared/models.ts";
import { LLM_FALLBACK_ORDER } from "./models.ts";
import { resolveLLMTarget } from "./target.ts";
import { providerOf } from "./provider.ts";

/** Preserves the existing buildLLMChain provider boundary. */
export async function buildLLMChain(
  supabase: AgentDatabaseClient,
  tenantId: string,
  primaryFullId: string,
): Promise<Array<LLMTarget>> {
  const ordered: Array<string> = [];
  /** Retains the original add helper. */
  function add(id: string) {
    const full = resolveModelId(id);
    if (!ordered.includes(full)) {
      ordered.push(full);
    }
  }
  add(primaryFullId);
  for (const m of LLM_FALLBACK_ORDER) {
    add(m);
  }
  // All models at once (each resolve is a key lookup); the order is kept, and a model whose
  // provider key is missing is skipped (resolveLLMTarget throws for it).
  const resolved = await Promise.all(
    ordered.map(async (full) => {
      try {
        const t = await resolveLLMTarget(supabase, tenantId, full);
        return { ...t, label: full, provider: providerOf(full) };
      } catch {
        return null;
      }
    }),
  );
  return resolved.filter((t): t is LLMTarget => t !== null);
}
