// A Carmen V2 prompt for a small test tenant, for the Deno tests that read
// what V2 tells Carmen.
import { buildCarmenV2SystemPrompt } from "../carmen-prompt-v2.ts";

/**
 * The V2 prompt with `systemPrompt` as the agent's ai_agents.system_prompt and `metadata` as
 * its metadata (e.g. a renamed `visual_identity.displayName`).
 */
export function v2Prompt(
  systemPrompt: string | null,
  metadata: Record<string, unknown> | null = null,
): string {
  return buildCarmenV2SystemPrompt({
    agent: { name: "כרמן", system_prompt: systemPrompt, metadata },
    tenant: {
      tenantName: "סוכנות",
      tenantId: "t",
      ownAgencyList: "",
      sharedAgencyList: "",
      sharedAgenciesCount: 0,
      leadsByStatus: {},
      totalLeads: 0,
      activeClients: 0,
      openTasks: 0,
    },
    memory: { instructionItems: [], otherItems: [] },
    isWhatsApp: false,
    currentDate: "",
    currentTime: "",
    todayISO: "2026-10-26",
    tomorrowISO: "2026-10-27",
  });
}
