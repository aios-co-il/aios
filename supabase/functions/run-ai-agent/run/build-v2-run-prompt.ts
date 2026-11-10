import { buildCarmenV2SystemPrompt } from "../../_shared/carmen-prompt-v2.ts";
import type { RunState } from "./state.ts";
/** Preserves this part of the V2 prompt and its precedence. */
export function buildV2RunPrompt(run: RunState): void {
  // Build V2 prompt using the new modular builder
  // We need to collect all the context that V1 was building inline
  // Rebuild the context objects that V1 built inline
  const callerContext = {
    callerName: run.callerName ?? undefined,
    callerCampaignerId: run.callerCampaignerId ?? undefined,
    callerRole: run.callerRole ?? undefined,
    isManagerRole: run.isManagerRoleCaller,
    isTeamManager: run.isTeamManagerCaller,
    managedAgencyIds: run.callerManagedAgencyIds,
  };
  const tenantContextObj = {
    tenantName: run.tenantName,
    tenantId: run.resolvedTenantId,
    ownAgencyList: run.ownAgencyList,
    sharedAgencyList: run.sharedAgencyList,
    sharedAgenciesCount: run.sharedAgencies.length,
    leadsByStatus: run.leadsByStatus,
    totalLeads: run.leadsData.data?.length || 0,
    activeClients: run.clientsData.count ?? 0,
    openTasks: run.tasksData.count ?? 0,
  };
  const memoryItemsObj = {
    instructionItems:
      run.memoryRes.data?.filter((m) => m.category === "instructions") || [],
    otherItems:
      run.memoryRes.data?.filter((m) => m.category !== "instructions") || [],
  };
  // Build date/time context
  const now = new Date();
  const currentDate = now.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Jerusalem",
  });
  const currentTime = now.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
  const tomorrowISO = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const todayISO = now.toISOString().split("T")[0];
  // Lead data context
  const leadDataObj: Record<string, string> = {};
  if (run.lead_data) {
    Object.entries(run.lead_data).forEach(([k, v]) => {
      if (v) {
        leadDataObj[k] = String(v);
      }
    });
  }
  run.systemPrompt = buildCarmenV2SystemPrompt({
    agent: run.agent,
    tenant: tenantContextObj,
    caller: callerContext,
    memory: memoryItemsObj,
    leadData: leadDataObj,
    taskMode: run.task_mode,
    taskSkills: run.task_skills,
    isWhatsApp: run.isCarmen && run.input.surface === "whatsapp",
    currentDate,
    currentTime,
    todayISO,
    tomorrowISO,
  });
}
