import type { RunState } from "./state.ts";
import { resolveSkillsBySlug } from "../../_shared/skills/registry.ts";
import { resolveActiveSkills } from "../../_shared/skills/registry.ts";
import { isDevEscalationSkill } from "../../_shared/dev-escalation-auth.ts";
import { isBugfixEscalationSkill } from "../../_shared/dev-escalation-auth.ts";
import { missingEnabledTools } from "../missing-enabled-tools.ts";
import { ALL_TOOLS } from "../tool-catalog.ts";
import { isDevEscalationToolAllowed } from "../../_shared/dev-escalation-auth.ts";
/** match Run Skills in the original run order. */
export async function matchRunSkills(
  run: RunState,
): Promise<Response | string | void> {
  const _matchedSkills = run.pinSkillsOnly
    ? (
        await resolveSkillsBySlug(
          run.task_skills as Array<string>,
          run.skillTenantId,
        )
      ).filter((s) => !run.disabledSkins.includes(s.id))
    : (
        await resolveActiveSkills(
          String(run.command_text || ""),
          run.skillTenantId,
        )
      )
        .filter((s) => !run.disabledSkins.includes(s.id))
        // Unauthorized callers must not get generic cursor/claude escalation skins.
        // Bugfix tier may still load the dedicated bugfix escalation skin.
        .filter(
          (s) =>
            run.devEscalationTier === "full" ||
            !isDevEscalationSkill(s.id) ||
            (run.devEscalationTier === "bugfix" &&
              isBugfixEscalationSkill(s.id)),
        );
  run.matchedSkills = _matchedSkills.map((s) => s.id);
  const activeSkillsBlock =
    _matchedSkills.length > 0
      ? "\n\n" + _matchedSkills.map((s) => s.prompt).join("\n\n")
      : "";
  if (activeSkillsBlock) {
    run.systemPrompt += activeSkillsBlock;
    console.log(
      `[AGENT] Active skills (${run.input.surface}): ${run.matchedSkills.join(", ")} | sources: ${_matchedSkills.map((s) => s.source).join(",")}`,
    );
    // Skin → capability enforcement: a matched skin's allowed_tools are
    // guaranteed to be available, even when agent.allowed_tools narrows the
    // set. Explicitly disabled tools stay disabled (denylist wins), and so do
    // the pulse tools for an unidentified caller (skinToolDenylist).
    const skillToolNames = new Set(
      _matchedSkills.flatMap((s) => s.tools || []),
    );
    if (skillToolNames.size > 0 && !run.pinSkillsOnly) {
      const missing = missingEnabledTools(
        run.filteredTools,
        ALL_TOOLS,
        skillToolNames,
        run.skinDisabledTools,
      ).filter(
        (t) =>
          run.workshopToolAllowed(t.name) &&
          isDevEscalationToolAllowed(t.name, run.devEscalationTier),
      );
      if (missing.length > 0) {
        run.filteredTools = [...run.filteredTools, ...missing];
        for (const t of missing) {
          run.promotedToolNames.add(t.name);
        }
        run.rebuildToolsForApi();
        console.log(
          `[AGENT] Skill tools added: ${missing.map((t) => t.name).join(", ")}`,
        );
      }
    }
    // Usage signal (fire-and-forget): matched skins bump usage_count so real
    // usage data accumulates for ranking/cleanup. Never blocks the reply.
    run.supabase
      .rpc("bump_skill_usage_by_slug", {
        p_slugs: run.matchedSkills,
        p_tenant_id: run.skillTenantId as string,
      })
      .then(
        () => {},
        () => {},
      );
  }
  // Skins pinned by the caller (task_skills, e.g. the Creative studio chat) also get
  // their tools, like trigger-matched skins above; their prompts were added earlier.
  if (
    !run.pinSkillsOnly &&
    Array.isArray(run.task_skills) &&
    run.task_skills.length > 0
  ) {
    try {
      const pinned = (
        await resolveSkillsBySlug(
          run.task_skills as Array<string>,
          run.skillTenantId,
        )
      ).filter((s) => !run.disabledSkins.includes(s.id));
      const missing = missingEnabledTools(
        run.filteredTools,
        ALL_TOOLS,
        pinned.flatMap((s) => s.tools || []),
        run.skinDisabledTools,
      ).filter(
        (t) =>
          run.workshopToolAllowed(t.name) &&
          isDevEscalationToolAllowed(t.name, run.devEscalationTier),
      );
      if (missing.length > 0) {
        run.filteredTools = [...run.filteredTools, ...missing];
        for (const t of missing) {
          run.promotedToolNames.add(t.name);
        }
        run.rebuildToolsForApi();
        console.log(
          `[AGENT] Pinned skin tools added: ${missing.map((t) => t.name).join(", ")}`,
        );
      }
    } catch (e) {
      console.error("[AGENT] pinned skin tools failed (non-fatal):", e);
    }
  }
}
