/**
 * Server-side checks for Carmen's per-user brain permissions. The access row
 * is always looked up against the tenant's resolved Carmen agent, never an
 * agent id the caller chose, so a restricted user cannot dodge it.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { resolveCarmenAgent } from "./agent-channel/store.ts";
import { brainLevel, type BrainAccessRow } from "./carmen-brain-access.ts";

export async function loadCarmenAccessRow(
  sb: SupabaseClient,
  tenantId: string,
  carmenAgentId: string,
  userId: string,
): Promise<BrainAccessRow> {
  const { data } = await sb
    .from("carmen_command_center_access")
    .select("enabled, brain_access")
    .eq("tenant_id", tenantId)
    .eq("agent_id", carmenAgentId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BrainAccessRow) ?? null;
}

const isCarmenName = (name: unknown) =>
  typeof name === "string" &&
  (name.toLowerCase().includes("carmen") || name.includes("כרמן"));

/**
 * run-ai-agent: may this user run Carmen's main ("internal") brain? Resolves
 * the agent the same way run-ai-agent does (explicit id, else the tenant's
 * Carmen) and checks every user request, whatever surface it claims.
 * Requests for other, non-Carmen agents are not governed by these rows.
 */
export async function internalBrainAllowed(
  sb: SupabaseClient,
  args: { userId: string; tenantId?: unknown; agentId?: unknown },
): Promise<boolean> {
  let tenantId = typeof args.tenantId === "string" ? args.tenantId : "";
  let carmenId = "";
  if (typeof args.agentId === "string" && args.agentId) {
    const { data: agent } = await sb
      .from("ai_agents")
      .select("id, name, tenant_id")
      .eq("id", args.agentId)
      .maybeSingle();
    // Unknown agent: run-ai-agent rejects it on its own.
    if (!agent || !isCarmenName(agent.name)) return true;
    carmenId = agent.id;
    tenantId = agent.tenant_id;
  } else {
    if (!tenantId) return true; // run-ai-agent rejects a request with neither.
    carmenId = (await resolveCarmenAgent(sb, tenantId))?.id ?? "";
    if (!carmenId) return true; // no Carmen to protect.
  }
  const row = await loadCarmenAccessRow(sb, tenantId, carmenId, args.userId);
  return brainLevel(row, "internal") !== null;
}
