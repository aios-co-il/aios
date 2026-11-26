/**
 * The voice a Carmen voice note speaks on the line that received the message
 * (AIO-654). The organization's main line speaks its Carmen voice
 * (`ai_agents.voice`); a personal (secondary) line speaks its owner's stored
 * pick (`carmen_user_choices.voice`) while the owner is still a member of the
 * line's tenant, else the Carmen voice; a voice text-to-speech cannot speak
 * passes to the next one, then to the default (chooseSpeechVoice). Every read
 * is scoped to the line's own tenant.
 */
import { isTenantMember } from "../_shared/auth/tenant-access.ts";
import { loadCarmenAgent } from "../_shared/carmen/load-carmen-agent.ts";
import { chooseSpeechVoice } from "../_shared/carmen/voices/voice-choice.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { VoiceLine } from "./handler.ts";

/** The reads the choice needs; each answers null when there is nothing usable. */
export type LineVoiceReads = {
  /** The tenant's Carmen voice (ai_agents.voice). */
  agentVoice: (tenantId: string) => Promise<string | null>;
  /** The voice the user stored in the tenant, only while they are its member. */
  memberVoice: (tenantId: string, userId: string) => Promise<string | null>;
};

/** The voice the line speaks; skipped candidates are logged, never message text. */
export async function chooseLineVoice(
  line: VoiceLine,
  reads: LineVoiceReads,
): Promise<string> {
  const owner = line.role === "secondary" ? line.ownerUserId : null;
  const [ownerVoice, agentVoice] = await Promise.all([
    owner ? reads.memberVoice(line.tenantId, owner) : null,
    reads.agentVoice(line.tenantId),
  ]);

  const choice = chooseSpeechVoice([ownerVoice, agentVoice]);
  for (const skipped of choice.skipped) {
    console.warn(
      `[send-manus-wa-voice] voice ${JSON.stringify(skipped.voice)} not used on line ${line.id}: ${skipped.reason}`,
    );
  }

  return choice.voice;
}

/** The reads over the service-role client; a failed read is logged and answers null. */
export function dbLineVoiceReads(sb: Pick<DbClient, "from">): LineVoiceReads {
  return {
    agentVoice: async (tenantId) => {
      try {
        const agent = await loadCarmenAgent(sb, tenantId, {
          activeOnly: false,
        });
        return agent?.voice ?? null;
      } catch (error) {
        console.error(
          `[send-manus-wa-voice] Carmen's voice could not be read (tenant ${tenantId})`,
          error,
        );
        return null;
      }
    },
    memberVoice: (tenantId, userId) => memberVoice(sb, tenantId, userId),
  };
}

/**
 * The user's stored voice in the tenant. Their row outlives their membership,
 * so a user who left (or a super admin who never joined) gets null.
 */
async function memberVoice(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  try {
    if (!(await isTenantMember(sb, tenantId, userId))) {
      console.warn(
        `[send-manus-wa-voice] the line owner ${userId} is not a member of tenant ${tenantId}; their voice is not used`,
      );
      return null;
    }
  } catch (error) {
    console.error(
      `[send-manus-wa-voice] the line owner's membership could not be read (tenant ${tenantId}, owner ${userId})`,
      error,
    );
    return null;
  }

  const { data, error } = await sb
    .from("carmen_user_choices")
    .select("voice")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      `[send-manus-wa-voice] carmen_user_choices read failed (tenant ${tenantId}, owner ${userId}): ${error.message}`,
    );
    return null;
  }

  return data?.voice ?? null;
}
