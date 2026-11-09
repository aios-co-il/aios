import type { RecallSkillsArgs } from "./skill-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing recall_skills executor and side-effect order. */
export async function executeRecallSkills(
  args: RecallSkillsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const limit = Math.min(args.limit || 5, 20);
  const q = String(args.query || "").trim();
  // The tenant's own skills and the global skins every tenant has (scope = 'global').
  const skillScope = `tenant_id.eq.${tenantId},scope.eq.global`;
  // Try FTS first; fall back to ILIKE
  const { data: matchedSkills, error } = await supabase
    .from("ai_skills")
    .select(
      "id, name, description, steps, trigger_phrases, usage_count, version, last_used_at",
    )
    .or(skillScope)
    .eq("is_active", true)
    .textSearch("search_vector", q.split(/\s+/).filter(Boolean).join(" | "), {
      type: "websearch",
      config: "simple",
    })
    .limit(limit);
  let data = matchedSkills;
  if (error || !data || data.length === 0) {
    const { data: fb } = await supabase
      .from("ai_skills")
      .select(
        "id, name, description, steps, trigger_phrases, usage_count, version, last_used_at",
      )
      .or(skillScope)
      .eq("is_active", true)
      .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(limit);
    data = fb || [];
  }
  return { count: data?.length || 0, skills: data || [] };
}
