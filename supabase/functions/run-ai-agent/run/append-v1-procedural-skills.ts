import type { ProceduralSkill } from "./contracts.ts";
import type { RunState } from "./state.ts";
/** Preserves this part of the V1 prompt and its precedence. */
export async function appendV1ProceduralSkills(run: RunState): Promise<void> {
  // === HERMES: Auto-inject relevant DB skills (procedural memory) ===
  try {
    const queryText = String(run.command_text || "").trim();
    if (queryText) {
      const tokens = queryText
        .split(/\s+/)
        .filter((t: string) => t.length > 1)
        .slice(0, 8);
      let relevantSkills: Array<ProceduralSkill> = [];
      if (tokens.length > 0) {
        const tsQuery = tokens.join(" | ");
        const { data: ftsHits } = await run.supabase
          .from("ai_skills")
          .select("id, name, description, steps, version, usage_count")
          .eq("tenant_id", run.resolvedTenantId)
          .eq("is_active", true)
          .textSearch("search_vector", tsQuery, {
            type: "websearch",
            config: "simple",
          })
          .limit(3);
        relevantSkills = ftsHits || [];
      }
      if (relevantSkills.length > 0) {
        const skillsBlock = relevantSkills
          .map(
            (s) =>
              `### ${s.name} (v${s.version}, used ${s.usage_count}×)\n${s.description}\n\n${s.steps}`,
          )
          .join("\n\n---\n\n");
        run.systemPrompt += `\n\n=== סקילים שמורים (פרוצדורות מעבר התנסויות) ===\nאלה פרוצדורות ששמרת או שנשמרו עבורך ממשימות דומות. אם רלוונטי - בצעי לפיהן. אם זיהית דרך טובה יותר - השתמשי ב-update_skill.\n\n${skillsBlock}`;
        // Update usage stats async (don't block)
        const skillIds = relevantSkills.map((s) => s.id);
        (
          run.supabase
            .rpc("increment_skill_usage", { skill_ids: skillIds })
            .then(() => {}) as Promise<void>
        ).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[Hermes] Skill injection failed (non-fatal):", e);
  }
}
