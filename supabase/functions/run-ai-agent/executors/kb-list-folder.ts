import type { KbListFolderArgs } from "./knowledge-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing kb_list_folder executor and side-effect order. */
export async function executeKbListFolder(
  args: KbListFolderArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("carmen_memory_pointers")
    .select(
      "id, category, subcategory, path, entity_type, entity_id, title, summary, ref_date, importance",
    )
    .in("tenant_id", accessibleTenantIds);
  if (args.category) {
    q = q.eq("category", args.category);
  }
  if (args.subcategory) {
    q = q.eq("subcategory", args.subcategory);
  }
  if (args.path_prefix) {
    q = q.like("path", `${args.path_prefix}%`);
  }
  const { data, error } = await q
    .order("ref_date", { ascending: false, nullsFirst: false })
    .limit(args.limit || 50);
  if (error) {
    throw error;
  }
  return { count: data.length, pointers: data };
}
