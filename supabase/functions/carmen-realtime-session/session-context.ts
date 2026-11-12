import { serviceClient } from "../_shared/supabase-clients.ts";
import { callerAddressLine } from "../_shared/carmen/user-address.ts";
import { loadVoiceAgent, type VoiceAgent } from "./agent-profile.ts";
import {
  loadOrgBrief,
  type OrgBrief,
} from "../_shared/carmen/org-brief/brief.ts";
import { orgBriefInstructions } from "./org-brief-text.ts";
import {
  loadPronunciations,
  type Pronunciation,
} from "../_shared/carmen/pronunciations/dictionary.ts";
import { pronunciationInstructions } from "./pronunciations.ts";
import {
  type LastConversation,
  lastConversationInstructions,
  loadLastConversation,
} from "./last-conversation.ts";
import {
  loadPulseBrief,
  type PulseBrief,
  pulseBriefInstructions,
} from "./pulse-brief.ts";
import { buildVoiceInstructions } from "./voice-instructions.ts";
import { voiceBriefScope } from "./voice-scope.ts";

/** Carmen's settings, pronunciations and org brief for the session's tenant. */
export type SessionContext = {
  agent: VoiceAgent | null;
  pronunciations: Array<Pronunciation>;
  orgBrief: OrgBrief | null;
  /** The caller's last conversation with Carmen, so a new call continues it. */
  lastConversation: LastConversation | null;
  /** The latest campaign pulse for the clients the caller may hear about. */
  pulseBrief: PulseBrief | null;
};

/** Loads what both voice providers speak from; each part falls back on its own. */
export async function loadSessionContext(
  userId: string,
  requestedTenantId: unknown,
): Promise<SessionContext> {
  const db = serviceClient();
  const agent = await loadVoiceAgent(db, userId, requestedTenantId);
  if (!agent) {
    return {
      agent,
      pronunciations: [],
      orgBrief: null,
      lastConversation: null,
      pulseBrief: null,
    };
  }
  // The caller hears only the clients the brain would show them (manager: whole org).
  const scope = await voiceBriefScope(db, userId, agent.tenantId);
  const [pronunciations, orgBrief, lastConversation, pulseBrief] =
    await Promise.all([
      loadPronunciations(db, agent.tenantId),
      loadOrgBrief(db, agent.tenantId, new Date(), scope),
      loadLastConversation(db, userId, agent.tenantId),
      loadPulseBrief(db, agent.tenantId, scope),
    ]);
  return { agent, pronunciations, orgBrief, lastConversation, pulseBrief };
}

/** The session's instructions: persona and voice rules, org brief, pulse, last conversation, pronunciations. */
export function sessionInstructions(
  context: SessionContext,
  addressLine: string,
): string {
  return [
    buildVoiceInstructions(context.agent?.profile ?? null, addressLine),
    context.orgBrief ? orgBriefInstructions(context.orgBrief) : "",
    context.pulseBrief ? pulseBriefInstructions(context.pulseBrief) : "",
    context.lastConversation
      ? lastConversationInstructions(context.lastConversation)
      : "",
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
