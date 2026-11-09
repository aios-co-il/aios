import type { RecallMemoryFtsArgs } from "./memory-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { recallAgentMemoryFTS } from "../../_shared/agent-memory.ts";

/** Preserves the existing recall_memory_fts executor and side-effect order. */
export async function executeRecallMemoryFts(
  args: RecallMemoryFtsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, agentId } = context;

  // Hermes-style FTS recall across agent_memory (cross-session, importance-aware)
  const items = await recallAgentMemoryFTS(supabase, {
    tenant_id: tenantId,
    agent_id: (agentId || null) as string,
    query_text: args.query || "",
    limit: args.limit || 5,
    min_importance: args.min_importance || 0,
  });
  return { count: items.length, memories: items };
}
