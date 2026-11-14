/** Loads the org's assistant name for surfaces that have no Carmen agent row at hand (AIO-592). */

import type { DbClient } from "../supabase-clients.ts";
import { CARMEN_AGENT_FILTER } from "./brain-access.ts";
import { DEFAULT_ASSISTANT_NAME, orgAssistantName } from "./assistant-name.ts";

/** The org's name for its assistant; "כרמן" when the org has no Carmen agent or the read fails. */
export async function loadOrgAssistantName(
  db: DbClient,
  tenantId: string,
): Promise<string> {
  const { data, error } = await db
    .from("ai_agents")
    .select("name, metadata")
    .eq("tenant_id", tenantId)
    .or(CARMEN_AGENT_FILTER)
    .eq("active", true)
    .order("is_carmen", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[assistant-name] load failed", tenantId, error.message);
    return DEFAULT_ASSISTANT_NAME;
  }
  return orgAssistantName(data);
}
