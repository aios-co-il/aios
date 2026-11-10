import type { Database } from "../../_shared/database.types.ts";
import type { KbSearchArgs } from "./knowledge-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { aiEmbed } from "../../_shared/ai.ts";

/** Preserves the existing kb_search executor and side-effect order. */
export async function executeKbSearch(
  args: KbSearchArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds } = context;

  // Try semantic via embedding; fall back to text ILIKE on title/summary
  try {
    const vec = await aiEmbed(args.query);
    if (vec) {
      const { data, error } = await supabase.rpc("kb_match_pointers", {
        p_tenant_id: tenantId,
        p_query_embedding: vec,
        p_category: args.category || null,
        p_since_days: args.since_days || null,
        p_limit: args.limit || 20,
      } as unknown as Database["public"]["Functions"]["kb_match_pointers"]["Args"]);
      if (!error && data) {
        return { count: data.length, results: data, mode: "semantic" };
      }
    }
  } catch {
    /* fall through */
  }
  // Fallback text search
  let q = supabase
    .from("carmen_memory_pointers")
    .select(
      "id, category, subcategory, path, entity_type, entity_id, title, summary, ref_date",
    )
    .in("tenant_id", accessibleTenantIds)
    .or(`title.ilike.%${args.query}%,summary.ilike.%${args.query}%`);
  if (args.category) {
    q = q.eq("category", args.category);
  }
  if (args.since_days) {
    q = q.gte(
      "ref_date",
      new Date(Date.now() - args.since_days * 86400000).toISOString(),
    );
  }
  const { data, error } = await q
    .order("ref_date", { ascending: false, nullsFirst: false })
    .limit(args.limit || 20);
  if (error) {
    throw error;
  }
  return { count: data.length, results: data, mode: "text" };
}
