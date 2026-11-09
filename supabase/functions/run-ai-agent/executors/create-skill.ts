import type { CreateSkillArgs } from "./skill-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_skill executor and side-effect order. */
export async function executeCreateSkill(
  args: CreateSkillArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId } = context;

  const { data, error } = await supabase
    .from("ai_skills")
    .insert({
      tenant_id: tenantId,
      user_id: userId !== "system" ? userId : null,
      name: args.name,
      description: args.description,
      steps: args.body,
      trigger_phrases: Array.isArray(args.trigger_phrases)
        ? args.trigger_phrases
        : [],
      created_by_agent: true,
      is_active: true,
      version: 1,
    })
    .select("id, name, version")
    .single();
  if (error) {
    throw error;
  }
  console.log(`[Hermes] Skill created by Carmen: ${data.name} (id=${data.id})`);
  return {
    skill_id: data.id,
    name: data.name,
    version: data.version,
    message: "הסקיל נשמר. אשתמש בו אוטומטית במשימות דומות בעתיד.",
  };
}
