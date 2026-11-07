import { serviceClient } from "../_shared/supabase-clients.ts";
import { loadVoiceAgent, type VoiceAgent } from "./agent-profile.ts";
import { loadOrgBrief, type OrgBrief } from "./org-brief.ts";
import { orgBriefInstructions } from "./org-brief-text.ts";
import {
  loadPronunciations,
  type Pronunciation,
  pronunciationInstructions,
} from "./pronunciations.ts";
import { buildVoiceInstructions } from "./voice-instructions.ts";

/** Carmen's settings, pronunciations and org brief for the session's tenant. */
export type SessionContext = {
  agent: VoiceAgent | null;
  pronunciations: Array<Pronunciation>;
  orgBrief: OrgBrief | null;
};

/** Loads what both voice providers speak from; each part falls back on its own. */
export async function loadSessionContext(
  userId: string,
  requestedTenantId: unknown,
): Promise<SessionContext> {
  const db = serviceClient();
  const agent = await loadVoiceAgent(db, userId, requestedTenantId);
  if (!agent) {
    return { agent, pronunciations: [], orgBrief: null };
  }
  const [pronunciations, orgBrief] = await Promise.all([
    loadPronunciations(db, agent.tenantId),
    loadOrgBrief(db, agent.tenantId),
  ]);
  return { agent, pronunciations, orgBrief };
}

/** The session's instructions: persona and voice rules, org brief, pronunciations. */
export function sessionInstructions(
  context: SessionContext,
  callerName: string | null,
): string {
  return [
    buildVoiceInstructions(context.agent?.profile ?? null, callerName),
    context.orgBrief ? orgBriefInstructions(context.orgBrief) : "",
    pronunciationInstructions(context.pronunciations),
  ]
    .filter(Boolean)
    .join("\n");
}

/** The caller's name, so Carmen greets them by it; null when it cannot be read. */
export async function loadCallerName(userId: string): Promise<string | null> {
  try {
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const pr = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/profiles?id=eq.${userId}&select=full_name`,
      { headers: { apikey: service, Authorization: `Bearer ${service}` } },
    );
    if (pr.ok) {
      return (await pr.json())?.[0]?.full_name ?? null;
    }
    console.error(
      "[carmen-realtime-session] caller name read failed",
      pr.status,
    );
  } catch (e) {
    console.error(
      "[carmen-realtime-session] caller name read failed",
      e instanceof Error ? e.message : e,
    );
  }
  return null;
}
