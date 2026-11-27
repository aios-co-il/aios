import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  type KeyedPersona,
  resolveEffectivePersona,
} from "../_shared/carmen/persona-runtime.ts";
import type { PersonaLook } from "../_shared/carmen/personas.ts";
import { loadMiniMeGender } from "../_shared/carmen/load-minime-gender.ts";
import type { MiniMeGender } from "../_shared/carmen/minime-gender.ts";

/** The character the caller talks to in the session's tenant, and the gender it speaks in. */
export type VoiceCharacter = {
  /** The caller's effective character, or null for Carmen herself. */
  picked: KeyedPersona | null;
  gender: MiniMeGender;
};

/**
 * The caller's effective character (`resolveEffectivePersona`: their pick,
 * else the organization's) and its gender. The tenant is the one the session
 * already checked the caller's membership for.
 */
export async function loadVoiceCharacter(
  db: Pick<DbClient, "from">,
  tenantId: string,
  userId: string,
): Promise<VoiceCharacter> {
  const picked = await resolveEffectivePersona(db, tenantId, userId);
  const gender = await characterGender(
    db,
    picked?.persona.look ?? null,
    userId,
  );
  return { picked, gender };
}

/**
 * The gender a character speaks in: a Mini Me look follows the caller's Mini
 * Me set (the figure they see), every other look is a picture of Carmen and
 * stays feminine. The profile is read only for the Mini Me.
 */
export function characterGender(
  db: Pick<DbClient, "from">,
  look: PersonaLook | null,
  userId: string,
): Promise<MiniMeGender> {
  return look === "minime"
    ? loadMiniMeGender(db, userId)
    : Promise.resolve("female");
}
