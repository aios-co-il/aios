import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { FastTarget } from "./answer.ts";
import { FAST_LANE_MODELS } from "../llm/models.ts";
import { resolveLLMTarget } from "../llm/target.ts";

/** The first fast model the tenant has a key for that can stream, or null. */
export async function fastLaneTarget(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<(FastTarget & { label: string }) | null> {
  for (const label of FAST_LANE_MODELS) {
    try {
      return { ...(await resolveLLMTarget(supabase, tenantId, label)), label };
    } catch {
      /* no key for this provider: try the next */
    }
  }
  return null;
}
