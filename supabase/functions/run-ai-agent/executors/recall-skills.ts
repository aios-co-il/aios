import type { ToolExecutionContext } from "../tool-context.ts";

type RecallSkillsArgs = { query: string; limit?: number };

export async function executeRecallSkills(
  args: RecallSkillsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const limit = Math.min(args.limit || 5, 20);
  const q = String(args.query || "").trim();
  // The tenant's own skills and the global skins every tenant has (scope = 'global').
  const pattern = JSON.stringify(`%${q}%`);
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
  if (error) {
    console.error("[recall_skills] full-text search failed", error);
  }
  let data = matchedSkills;
  if (error || !data || data.length === 0) {
    const { data: fb, error: fallbackError } = await supabase
      .from("ai_skills")
      .select(
        "id, name, description, steps, trigger_phrases, usage_count, version, last_used_at",
      )
      .or(skillScope)
      .eq("is_active", true)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .limit(limit);
    if (fallbackError) {
      throw fallbackError;
    }
    data = fb || [];
  }
  return { count: data?.length || 0, skills: data || [] };
}
