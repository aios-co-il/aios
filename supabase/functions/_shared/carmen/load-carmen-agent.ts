/**
 * Loads a tenant's Carmen agent and the names she goes by (AIO-592). Every edge lookup of "the
 * org's Carmen" goes through `loadCarmenAgent`, so the flag-first rule in `carmen-agent.ts` holds
 * everywhere.
 */

import type { Tables } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import {
  DEFAULT_ASSISTANT_NAME,
  orgAssistantName,
  personalAssistantName,
} from "./assistant-name.ts";
import {
  CARMEN_AGENT_FILTER,
  pickActiveCarmenAgent,
  pickCarmenAgent,
} from "./carmen-agent.ts";
import { loadCallerPersona } from "./persona-runtime.ts";

type Db = Pick<DbClient, "from">;

/** Enough rows to hold every Carmen candidate a tenant has. */
const CANDIDATE_LIMIT = 50;

/**
 * The tenant's Carmen agent (`pickCarmenAgent`). With `activeOnly`, null when she is inactive,
 * even if another Carmen-named agent is active. Throws when the read fails.
 */
export async function loadCarmenAgent(
  db: Db,
  tenantId: string,
  { activeOnly }: { activeOnly: boolean },
): Promise<Tables<"ai_agents"> | null> {
  const { data, error } = await db
    .from("ai_agents")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(CARMEN_AGENT_FILTER)
    .limit(CANDIDATE_LIMIT);
  if (error) {
    throw new Error(`ai_agents read failed: ${error.message}`);
  }
  return activeOnly ? pickActiveCarmenAgent(data) : pickCarmenAgent(data);
}

/** The org's name for its assistant; "כרמן" when it has no Carmen agent or the read fails. */
export async function loadOrgAssistantName(
  db: Db,
  tenantId: string,
): Promise<string> {
  try {
    return orgAssistantName(
      await loadCarmenAgent(db, tenantId, { activeOnly: false }),
    );
  } catch (err) {
    console.error("[assistant-name] org name load failed", tenantId, err);
    return DEFAULT_ASSISTANT_NAME;
  }
}

/** The name a user's own surface shows: their character, else the org's name. */
export async function loadPersonalAssistantName(
  db: Db,
  tenantId: string,
  userId: string | null,
): Promise<string> {
  const [orgName, persona] = await Promise.all([
    loadOrgAssistantName(db, tenantId),
    loadCallerPersona(db, tenantId, userId),
  ]);
  return personalAssistantName(persona?.displayName, orgName);
}
