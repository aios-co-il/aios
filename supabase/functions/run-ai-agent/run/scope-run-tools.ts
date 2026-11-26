import type { RunState } from "./state.ts";
import { ALL_TOOLS } from "../tool-catalog.ts";
import { keepCarmenPulseTools } from "../pulse-refresh/tool-pool.ts";
import { skinToolDenylist } from "../pulse-refresh/tool-pool.ts";
import { isWorkshopTurn } from "../workshop-turn-setup.ts";
import { workshopTurnTools } from "../workshop-turn-setup.ts";
import { workshopToolOffered } from "../../_shared/workshop/blocked-tools.ts";
import { isCachedPulseRequest } from "../../_shared/pulse-request.mjs";
import { decidePulseRefreshRouting } from "../pulse-refresh/routing.ts";
import { pulseSurfacePrefersWhatsAppDigest } from "../../_shared/campaign-pulse.ts";

export async function scopeRunTools(
  run: RunState,
): Promise<Response | string | void> {
  // 4. Filter tools
  const allowedTools = run.agent.allowed_tools || [];
  run.filteredTools =
    allowedTools.length > 0
      ? ALL_TOOLS.filter(
          (t) =>
            allowedTools.includes(t.name) ||
            (run.isCarmenAgent && t.name === "get_carmen_skins"),
        )
      : ALL_TOOLS;
  run.toolPoolBeforeRouting = run.filteredTools;
  // Access control (denylist): subtract tools turned OFF in settings. Default
  // (empty) = no change, so Carmen keeps access to everything by default.
  const disabledTools = run.agent.disabled_tools || [];

  if (disabledTools.length > 0) {
    run.filteredTools = run.filteredTools.filter(
      (t) => !disabledTools.includes(t.name),
    );
  }

  run.filteredTools = keepCarmenPulseTools(run.filteredTools, ALL_TOOLS, {
    isCarmen: run.isCarmenAgent,
    disabledTools,
    caller: {
      surface: run.input.surface,
      callerCampaignerId: run.callerCampaignerId,
      callerUserId: run.callerUserId,
    },
  });
  run.skinDisabledTools = skinToolDenylist(disabledTools, {
    surface: run.input.surface,
    callerCampaignerId: run.callerCampaignerId,
    callerUserId: run.callerUserId,
  });
  run.inWorkshop = isWorkshopTurn(run.input.surface, run.task_skills);
  run.filteredTools = workshopTurnTools(run.filteredTools, run.inWorkshop);
  run.workshopToolAllowed = (name: string) =>
    workshopToolOffered(name, run.inWorkshop);

  // The system graph contains internal architecture. Keep it invisible to
  // non-manager callers even if an agent's allowlist includes the tool.
  if (!run.isManagerRoleCaller) {
    run.filteredTools = run.filteredTools.filter(
      (t) => t.name !== "query_system_graph",
    );
  }

  run.cmd = (run.command_text || "").toString();
  run.isStoredPulseRequest =
    !run.pinSkillsOnly && isCachedPulseRequest(run.cmd);
  run.pulseRefreshRoute = decidePulseRefreshRouting({
    text: run.cmd,
    isCarmen: run.isCarmenAgent,
    pinSkillsOnly: run.pinSkillsOnly,
    digestSurface: pulseSurfacePrefersWhatsAppDigest(run.input.surface),
    caller: {
      campaignerId: run.callerCampaignerId,
      userId: run.callerUserId,
      role: run.callerRole,
    },
  });
}
