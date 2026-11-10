import type { RunState } from "./state.ts";
import { buildSkillsBlockBySlug } from "../../_shared/skills/registry.ts";
import { activeSkinBlock } from "../../_shared/carmen/active-skin.ts";
import { parseActiveSkin } from "../../_shared/carmen/active-skin.ts";
import { callerAddressLine } from "../../_shared/carmen/user-address.ts";
import { automationInstructionsBlock } from "../../_shared/carmen-connection-role.ts";
import { sanitizeCarmenInstructions } from "../../_shared/carmen-connection-role.ts";
/** append Run Skins in the original run order. */
export async function appendRunSkins(
  run: RunState,
): Promise<Response | string | void> {
  // Pin DB skins from task_skills for BOTH prompt versions. V2 previously only
  // looked up a hardcoded map (no "copywriter"), so marketing studio chats
  // never actually loaded the copywriter skin. When pin_skills_only is set the
  // same slugs are also resolved later as the exclusive matched-skill set
  // (prompts + tools); this early block still covers the default path.
  if (
    run.task_skills &&
    Array.isArray(run.task_skills) &&
    run.task_skills.length > 0 &&
    !run.pinSkillsOnly
  ) {
    try {
      const pinnedTenantId = run.agent?.tenant_id || run.tenant_id || null;
      const disabledForPin = (run.agent?.disabled_skins || []) as Array<string>;
      const pinnableSlugs = (run.task_skills as Array<string>).filter(
        (s) => !disabledForPin.includes(s),
      );
      const pinnedBlock = await buildSkillsBlockBySlug(
        pinnableSlugs,
        pinnedTenantId,
      );
      if (pinnedBlock) {
        run.systemPrompt += pinnedBlock;
        console.log(
          `[AGENT] Pinned skins by slug: ${(run.task_skills as Array<string>).join(", ")}`,
        );
      }
    } catch (e) {
      console.error("[AGENT] pinned-skin resolution failed (non-fatal):", e);
    }
  }
  // The skin picked in this chat session shapes Carmen for this run only. In the workshop the
  // role's skill is already pinned; the persona's older skills would contradict it.
  if (run.isCarmen && !run.pinSkillsOnly) {
    if (!run.workshopRoleForRun) {
      run.systemPrompt += await activeSkinBlock({
        slug: parseActiveSkin(run.input.bodyJson.active_skin),
        tenantId: run.agent.tenant_id || run.tenant_id || null,
        disabledSkins: run.agent.disabled_skins,
        pinned: run.task_skills,
      });
    }
    if (run.workshopNote) {
      run.systemPrompt += `\n\n${run.workshopNote}`;
    }
  }
  // Hebrew verbs carry gender: Carmen addresses the caller by their profile's gender, else plural.
  // The profile name wins over user_name, which some screens set to a department label.
  run.systemPrompt += await callerAddressLine(
    run.supabase,
    run.callerUserId,
    run.callerName,
  );
  // Per-automation instructions for this WhatsApp conversation (set on the
  // Carmen automation; stripped in Deno.serve for non-service callers).
  if (
    run.input.surface === "whatsapp" &&
    run.input.bodyJson.carmen_automation &&
    typeof run.input.bodyJson.carmen_automation === "object"
  ) {
    run.systemPrompt += automationInstructionsBlock(
      sanitizeCarmenInstructions(
        run.input.bodyJson.carmen_automation.carmen_instructions,
      ),
    );
  }
  const promptAddon =
    typeof run.input.bodyJson.system_prompt_addon === "string"
      ? run.input.bodyJson.system_prompt_addon.trim()
      : "";
  if (promptAddon) {
    run.systemPrompt += `\n\n=== הקשר סטודיו (משימה מבודדת) ===\n${promptAddon}`;
  }
}
