/**
 * Server-side checks for Carmen's per-user brain permissions. The access row
 * is always looked up against the tenant's resolved Carmen agent, never an
 * agent id the caller chose, so a restricted user cannot dodge it.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { corsHeaders } from "../cors.ts";
import { resolveCarmenAgent } from "../agent-channel/store.ts";
import {
  BRAIN,
  brainLevel,
  carmenEnabledFor,
  isCarmenName,
  toAccessRow,
  type BrainAccessRow,
} from "./brain-access.ts";

/** A user's permissions row for one Carmen agent, or null (unrestricted). */
export async function loadCarmenAccessRow(
  sb: Pick<SupabaseClient, "from">,
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
  return toAccessRow(data);
}

/** What a refusal names: one brain, the parliament table, or Carmen herself. */
export type DeniedTarget = "brain" | "parliament" | "internal" | "carmen";

/** The 403 every Carmen permission check returns. */
export function brainDenied(target: DeniedTarget): Response {
  return new Response(
    JSON.stringify({
      error: DENIED_MESSAGE[target],
      code: "brain_not_allowed",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/** agent-channel-send actions that drive a running parliament round. */
const PARLIAMENT_ACTIONS = new Set([
  "parliament_continue",
  "parliament_synthesize",
  "parliament_clarify",
]);
/** Actions any member may call: reading the list, health, stopping a round. */
const OPEN_ACTIONS = new Set([
  "list_routes",
  "channel_health",
  "cancel_parliament",
]);

/**
 * agent-channel-send: refuses an action before it runs. A user with Carmen
 * turned off may only read and cancel; parliament actions need that grant.
 * Per-brain checks for send/select happen once the route is known.
 */
export function channelActionDenied(
  action: string,
  row: BrainAccessRow,
): Response | null {
  if (OPEN_ACTIONS.has(action)) return null;
  if (!carmenEnabledFor(row)) return brainDenied("carmen");
  if (PARLIAMENT_ACTIONS.has(action) && !brainLevel(row, BRAIN.parliament))
    return brainDenied("parliament");
  return null;
}

/**
 * run-ai-agent: may this user run Carmen's main ("internal") brain? Resolves
 * the agent the same way run-ai-agent does (explicit id, else the tenant's
 * Carmen) and checks every user request, whatever surface it claims. Another
 * Carmen-named agent is checked against the resolved Carmen's row; requests
 * for other, non-Carmen agents are not governed by these rows.
 */
export async function internalBrainAllowed(
  sb: Pick<SupabaseClient, "from">,
  args: { userId: string; tenantId?: unknown; agentId?: unknown },
): Promise<boolean> {
  let tenantId = typeof args.tenantId === "string" ? args.tenantId : "";
  if (typeof args.agentId === "string" && args.agentId) {
    const { data: agent } = await sb
      .from("ai_agents")
      .select("id, name, tenant_id")
      .eq("id", args.agentId)
      .maybeSingle();
    // Unknown agent: run-ai-agent rejects it on its own.
    if (!agent || !isCarmenName(agent.name)) return true;
    tenantId = agent.tenant_id;
  }
  if (!tenantId) return true; // run-ai-agent rejects a request with neither.
  const carmenId = (await resolveCarmenAgent(sb, tenantId))?.id;
  if (!carmenId) return true; // no active Carmen to protect.
  const row = await loadCarmenAccessRow(sb, tenantId, carmenId, args.userId);
  return brainLevel(row, BRAIN.internal) !== null;
}

/**
 * The 403 for a signed-in user who may not run Carmen's main brain, or null.
 * Service-to-service calls are trusted here; callers acting for a user (such
 * as run-agent-task) check that user themselves.
 */
export async function internalBrainDenied(
  sb: SupabaseClient,
  auth: { kind: "user" | "service"; userId: string | null } | null,
  target: { tenantId?: unknown; agentId?: unknown },
): Promise<Response | null> {
  const refusal = await internalBrainRefusal(sb, auth, target);
  return refusal ? brainDenied("internal") : null;
}

/**
 * The refusal message when a signed-in user may not run Carmen's main brain,
 * else null; a caller that is not a signed-in user passes. trigger-automation
 * checks the user who started a run with it, since it calls Carmen with the
 * service key.
 */
export async function internalBrainRefusal(
  sb: Pick<SupabaseClient, "from">,
  caller: { kind: string; userId?: string | null } | null | undefined,
  target: { tenantId?: unknown; agentId?: unknown },
): Promise<string | null> {
  if (caller?.kind !== "user" || !caller.userId) {
    return null;
  }

  const allowed = await internalBrainAllowed(sb, {
    userId: caller.userId,
    ...target,
  });
  return allowed ? null : DENIED_MESSAGE.internal;
}

const DENIED_MESSAGE: Record<DeniedTarget, string> = {
  brain: "אין לך הרשאה למוח הזה. בקש/י גישה ממנהל המערכת.",
  parliament: "אין לך הרשאה לשולחן. בקש/י גישה ממנהל המערכת.",
  internal: "אין לך הרשאה למוח הראשי של כרמן. בקש/י גישה ממנהל המערכת.",
  carmen: "אין לך גישה לכרמן. בקש/י גישה ממנהל המערכת.",
};
