import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { FastTarget } from "./answer.ts";
import { FAST_LANE_MODELS } from "../llm/fallback-models.ts";
import { resolveLLMTarget } from "../llm/target.ts";

/** The first fast model the tenant has a key for that can stream, or null. */
export async function fastLaneTarget(
  supabase: DbClient,
  tenantId: string,
): Promise<(FastTarget & { label: string }) | null> {
  for (const label of FAST_LANE_MODELS) {
    try {
      return { ...(await resolveLLMTarget(supabase, tenantId, label)), label };
    } catch {
      console.error("[AGENT] fast-lane target resolution failed", {
        model: label,
      });
    }
  }

  return null;
}
