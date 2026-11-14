/**
 * Which of a tenant's agents is its Carmen (AIO-592): the agent flagged `ai_agents.is_carmen`,
 * else, for agents created without the flag, the one named like Carmen. The flagged agent wins
 * even when it is inactive, so an org that turned its Carmen off never quietly gets an unflagged
 * agent instead. Pure, so the edge loader (`load-carmen-agent.ts`) and the frontend loader
 * (`src/lib/carmenAgent.ts`) pick the same row.
 */

import { isCarmenName } from "./brain-access.ts";

/** The fields of an `ai_agents` row that identify Carmen and name her. */
export type CarmenAgentRef = {
  is_carmen?: boolean | null;
  name?: string | null;
  metadata?: unknown;
  active?: boolean | null;
  created_at?: string | null;
};

/** PostgREST filter for the candidates `pickCarmenAgent` chooses among. */
export const CARMEN_AGENT_FILTER =
  "is_carmen.eq.true,name.ilike.%carmen%,name.ilike.%כרמן%";

/** True for a Carmen candidate: flagged, or named like Carmen. */
export function isCarmenAgentRow(
  agent: CarmenAgentRef | null | undefined,
): boolean {
  return Boolean(agent && (agent.is_carmen || isCarmenName(agent.name)));
}

/**
 * The tenant's Carmen among `agents`: the flagged one, else the Carmen-named one, active before
 * inactive and then oldest first. Null when no agent qualifies.
 */
export function pickCarmenAgent<T extends CarmenAgentRef>(
  agents: ReadonlyArray<T> | null | undefined,
): T | null {
  const list = agents ?? [];
  const flagged = list.find((agent) => agent.is_carmen);
  if (flagged) {
    return flagged;
  }
  const named = list
    .filter((agent) => isCarmenName(agent.name))
    .sort(byActiveThenOldest);
  return named[0] ?? null;
}

/** `pickCarmenAgent`, or null when that agent is inactive. */
export function pickActiveCarmenAgent<T extends CarmenAgentRef>(
  agents: ReadonlyArray<T> | null | undefined,
): T | null {
  const agent = pickCarmenAgent(agents);
  return agent && agent.active !== false ? agent : null;
}

/** Sort order for unflagged candidates: active first, then the oldest. */
function byActiveThenOldest(a: CarmenAgentRef, b: CarmenAgentRef): number {
  const activeOrder = Number(b.active !== false) - Number(a.active !== false);
  if (activeOrder !== 0) {
    return activeOrder;
  }
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}
