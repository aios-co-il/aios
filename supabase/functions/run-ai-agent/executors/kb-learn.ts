import type { Database } from "../../_shared/database.types.ts";
import type { KbLearnArgs } from "./knowledge-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { aiEmbed } from "../../_shared/ai.ts";

/** Preserves the existing kb_learn executor and side-effect order. */
export async function executeKbLearn(
  args: KbLearnArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  // Generate embedding (best-effort)
  let embedding: Array<number> | null = null;
  try {
    embedding = await aiEmbed(`${args.topic}\n\n${args.summary}`);
  } catch {
    /* ignore */
  }
  const { data, error } = await supabase
    .from("carmen_memory_episodes")
    .insert({
      tenant_id: tenantId,
      topic: args.topic,
      topic_tags: args.topic_tags || [],
      summary: args.summary,
      summary_embedding:
        embedding as unknown as Database["public"]["Tables"]["carmen_memory_episodes"]["Insert"]["summary_embedding"],
      source_table: args.source_table || null,
      source_ids: args.source_ids || [],
      importance: Math.max(1, Math.min(10, args.importance || 5)),
      retention_score: 1.0,
      ref_date: new Date().toISOString(),
    })
    .select("id, topic")
    .single();
  if (error) {
    throw error;
  }
  return { learned: true, episode_id: data.id, topic: data.topic };
}
