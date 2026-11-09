import type { RecallMemoryArgs } from "./memory-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing recall_memory executor and side-effect order. */
export async function executeRecallMemory(
  args: RecallMemoryArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let query = supabase
    .from("ai_memory")
    .select("key, content, category, updated_at")
    .in("tenant_id", accessibleTenantIds);
  if (args.category) {
    query = query.eq("category", args.category);
  }
  if (args.search) {
    query = query.ilike("content", `%${args.search}%`);
  }
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    throw error;
  }
  return { count: data.length, memories: data };
}
