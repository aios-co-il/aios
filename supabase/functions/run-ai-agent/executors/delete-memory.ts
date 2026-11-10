import type { DeleteMemoryArgs } from "./memory-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing delete_memory executor and side-effect order. */
export async function executeDeleteMemory(
  args: DeleteMemoryArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { error } = await supabase
    .from("ai_memory")
    .delete()
    .in("tenant_id", accessibleTenantIds)
    .eq("key", args.key);
  if (error) {
    throw error;
  }
  return { deleted: true, key: args.key };
}
