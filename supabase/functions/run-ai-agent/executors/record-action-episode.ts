import type { RecordActionEpisodeArgs } from "./memory-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing record_action_episode executor and side-effect order. */
export async function executeRecordActionEpisode(
  args: RecordActionEpisodeArgs & { topic?: string },
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, callerPhone } = context;

  // Persist a heavy-action result into long-term memory so future calls
  // hit recall_recent_action instead of re-running.
  const topic = String(args.action_type || args.topic || "").trim();
  if (!topic) {
    throw new Error("action_type required");
  }
  const summary = String(args.summary || "").slice(0, 4000);
  if (!summary) {
    throw new Error("summary required");
  }
  const tags =
    Array.isArray(args.topic_tags) && args.topic_tags.length > 0
      ? args.topic_tags
      : [topic];
  const importance = Math.max(1, Math.min(100, Number(args.importance) || 50));
  const { data, error } = await supabase
    .from("carmen_memory_episodes")
    .insert({
      tenant_id: tenantId,
      topic,
      topic_tags: tags,
      summary,
      importance,
      ref_date: new Date().toISOString(),
      source_table: "agent_runs",
      participants: callerPhone ? { caller_phone: callerPhone } : {},
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return { episode_id: data.id, recorded: true };
}
