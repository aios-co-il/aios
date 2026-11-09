import type { KbRecallConversationArgs } from "./knowledge-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";

/** Preserves the existing kb_recall_conversation executor and side-effect order. */
export async function executeKbRecallConversation(
  args: KbRecallConversationArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("carmen_memory_episodes")
    .select(
      "id, topic, topic_tags, summary, source_table, source_ids, ref_date, importance, retention_score",
    )
    .in("tenant_id", accessibleTenantIds);
  if (args.topic) {
    q = q.ilike("topic", `%${args.topic}%`);
  }
  if (args.query) {
    q = q.or(`topic.ilike.%${args.query}%,summary.ilike.%${args.query}%`);
  }
  if (args.since_days) {
    q = q.gte(
      "ref_date",
      new Date(Date.now() - args.since_days * 86400000).toISOString(),
    );
  }
  const { data, error } = await q
    .order("ref_date", { ascending: false, nullsFirst: false })
    .limit(args.limit || 10);
  if (error) {
    throw error;
  }
  // Bump access count on returned episodes (non-blocking)
  if (data?.length) {
    supabase
      .from("carmen_memory_episodes")
      .update({ last_accessed_at: new Date().toISOString() })
      .in(
        "id",
        data.map((d: Pick<AgentRow<"carmen_memory_episodes">, "id">) => d.id),
      )
      .then(() => {});
  }
  return { count: data.length, episodes: data };
}
