import { serviceClient } from "../_shared/supabase-clients.ts";
import { callerAddressLine } from "../_shared/carmen/user-address.ts";
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
  addressLine: string,
): string {
  return [
    buildVoiceInstructions(context.agent?.profile ?? null, addressLine),
    context.orgBrief ? orgBriefInstructions(context.orgBrief) : "",
    pronunciationInstructions(context.pronunciations),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * How Carmen addresses the caller: their profile name and gender (Hebrew verbs carry gender),
 * the plural when the gender is unknown or the profile can't be read.
 */
export function loadCallerAddress(userId: string): Promise<string> {
  return callerAddressLine(serviceClient(), userId, null);
}
