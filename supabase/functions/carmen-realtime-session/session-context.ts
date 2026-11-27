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
import { personaPromptSection } from "../_shared/carmen/persona-prompt.ts";
import type { PersonaProfile } from "../_shared/carmen/personas.ts";
import type { MiniMeGender } from "../_shared/carmen/minime-gender.ts";
import { loadVoiceCharacter } from "./voice-character.ts";
import { CARMEN_GREETER, pickGreeting } from "./greetings.ts";
import { agentMoodPrompt } from "../_shared/carmen/agent-mood.ts";
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
  /**
   * The caller's effective character (AIO-570): their pick, else the
   * organization's; null to stay Carmen.
   */
  persona: PersonaProfile | null;
  /** The gender the character speaks in (Carmen: feminine). */
  gender: MiniMeGender;
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
      persona: null,
      gender: CARMEN_GREETER.gender,
    };
  }
  // The caller hears only the clients the brain would show them (manager: whole org).
  const scope = await voiceBriefScope(db, userId, agent.tenantId);
  const [pronunciations, orgBrief, lastConversation, pulseBrief, character] =
    await Promise.all([
      loadPronunciations(db, agent.tenantId),
      loadOrgBrief(db, agent.tenantId, new Date(), scope),
      loadLastConversation(db, userId, agent.tenantId),
      loadPulseBrief(db, agent.tenantId, scope),
      loadVoiceCharacter(db, agent.tenantId, userId),
    ]);
  const persona = character.picked?.persona ?? null;
  return {
    agent: withPersonaMood(agent, persona),
    pronunciations,
    orgBrief,
    lastConversation,
    pulseBrief,
    persona,
    gender: character.gender,
  };
}

/** The session's instructions: persona and voice rules, org brief, pulse, last conversation, pronunciations. */
export function sessionInstructions(
  context: SessionContext,
  addressLine: string,
): string {
  return [
    buildVoiceInstructions(context.agent?.profile ?? null, addressLine),
    context.persona ? personaPromptSection(context.persona).trim() : "",
    context.persona && context.gender === "male" ? MALE_SELF_LINE : "",
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
 * The voice prompt speaks to the assistant in the feminine; a male character
 * is told to speak of himself in the masculine, as his greeting does.
 */
const MALE_SELF_LINE =
  'הדמות שלך זכר: דבר על עצמך בלשון זכר ("אני בודק", "אני שומע").';

/** The call's opening line, said by the session's character (ElevenLabs `first_message`, OpenAI `greeting`). */
export function sessionGreeting(context: SessionContext): string {
  return pickGreeting({
    name: context.persona?.displayName ?? null,
    gender: context.gender,
  });
}

/** The picked character's mood replaces Carmen's own for this caller. */
function withPersonaMood(
  agent: VoiceAgent,
  persona: PersonaProfile | null,
): VoiceAgent {
  if (!persona?.mood) {
    return agent;
  }
  return {
    ...agent,
    profile: {
      ...agent.profile,
      moodPrompt: agentMoodPrompt(persona.mood, agent.tenantId),
    },
  };
}

/**
 * How Carmen addresses the caller: their profile name and gender (Hebrew verbs carry gender),
 * the plural when the gender is unknown or the profile can't be read.
 */
export function loadCallerAddress(userId: string): Promise<string> {
  return callerAddressLine(serviceClient(), userId, null);
}
