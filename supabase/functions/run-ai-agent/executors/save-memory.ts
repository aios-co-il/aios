import type { SaveMemoryArgs } from "./memory-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { saveAgentMemory } from "../../_shared/agent-memory.ts";

/** Preserves the existing save_memory executor and side-effect order. */
export async function executeSaveMemory(
  args: SaveMemoryArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, agentId } = context;

  const cat = args.category || "general";
  const { data, error } = await supabase
    .from("ai_memory")
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId && userId !== "system" ? userId : null,
        key: args.key,
        content: args.content,
        category: cat,
      },
      {
        onConflict: "user_id,tenant_id,category,key",
        ignoreDuplicates: false,
      },
    )
    .select("key, category")
    .single();
  if (error) {
    throw error;
  }
  // Mirror to agent_memory (Hermes FTS layer) for cross-conversation recall
  const importanceMap: Record<string, number> = {
    instructions: 95,
    preferences: 85,
    personal: 80,
    projects: 70,
    clients: 70,
    workflows: 65,
    general: 50,
  };
  // executeTool param is agentId — bare `agent_id` was a ReferenceError ("agent_id is not defined").
  saveAgentMemory({
    supabase,
    tenant_id: tenantId,
    agent_id: (agentId || null) as string,
    category: cat,
    title: args.key,
    summary: args.content,
    importance: importanceMap[cat] ?? 60,
    metadata: {
      source: "save_memory",
      key: args.key,
      user_id: userId || "system",
    },
  }).catch(() => {});
  return { saved: true, key: data.key, category: data.category };
}
