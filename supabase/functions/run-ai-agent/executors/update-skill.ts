import type { UpdateSkillArgs } from "./skill-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";

/** Preserves the existing update_skill executor and side-effect order. */
export async function executeUpdateSkill(
  args: UpdateSkillArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data: current } = await supabase
    .from("ai_skills")
    .select("id, version, name")
    .eq("id", args.skill_id)
    .eq("tenant_id", tenantId)
    .single();
  if (!current) {
    return { error: "Skill not found" };
  }
  const updates: TablesUpdate<"ai_skills"> = {
    steps: args.body,
    version: (current.version || 1) + 1,
    updated_at: new Date().toISOString(),
  };
  if (args.description) {
    updates.description = args.description;
  }
  const { data, error } = await supabase
    .from("ai_skills")
    .update(updates)
    .eq("id", args.skill_id)
    .eq("tenant_id", tenantId)
    .select("id, name, version")
    .single();
  if (error) {
    throw error;
  }
  console.log(
    `[Hermes] Skill updated: ${data.name} v${data.version} - ${args.change_note || ""}`,
  );
  return {
    skill_id: data.id,
    name: data.name,
    version: data.version,
    message: "הסקיל עודכן.",
  };
}
