import type { QuerySystemGraphArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing query_system_graph executor and side-effect order. */
export async function executeQuerySystemGraph(
  args: QuerySystemGraphArgs,
  context: ToolExecutionContext,
) {
  const { supabase, isManagerRole } = context;

  if (!isManagerRole) {
    throw new Error("אין הרשאה לעיין בגרף המערכת");
  }
  const query = String(args.query || "").trim();
  if (!query) {
    throw new Error("query is required");
  }
  const { data, error } = await supabase.rpc("carmen_query_system_graph", {
    p_query: query,
    p_depth: Math.min(3, Math.max(0, Number(args.depth ?? 2))),
    p_limit: Math.min(80, Math.max(1, Number(args.limit ?? 40))),
  });
  if (error) {
    throw error;
  }
  return { count: data?.length || 0, nodes: data || [], read_only: true };
}
