import type { DbClient } from "../supabase-clients.ts";
import {
  type KeyedPersona,
  type PersonaSource,
  loadKeyedPersona,
} from "./persona-runtime.ts";
import { loadMiniMeGender } from "./load-minime-gender.ts";
import type { MiniMeGender } from "./minime-gender.ts";

type Db = Pick<DbClient, "from">;

/** A character as it speaks: who it is, who chose it, and the gender its Hebrew verbs take. */
export interface PersonaSpeaker extends KeyedPersona {
  gender: MiniMeGender;
}

/**
 * The character a turn speaks as (`loadKeyedPersona`) with its gender, or
 * null when it speaks as Carmen herself. The app chat, its fast lane, the
 * WhatsApp turns and the voice session all read the gender here.
 */
export async function loadPersonaSpeaker(
  db: Db,
  tenantId: string | null,
  source: PersonaSource | null,
): Promise<PersonaSpeaker | null> {
  const keyed = await loadKeyedPersona(db, tenantId, source);
  const userId =
    source && source.kind !== "organization" ? source.userId : null;
  return withGender(db, keyed, userId);
}

/**
 * A character with the gender it speaks in. A Mini Me look follows the Mini
 * Me set of the user it speaks for (`loadMiniMeGender`; male with no user,
 * as on the organization's main WhatsApp line); every other look is a
 * picture of Carmen and stays feminine. The profile is read only for the Mini Me.
 */
export async function withGender(
  db: Db,
  keyed: KeyedPersona | null,
  userId: string | null,
): Promise<PersonaSpeaker | null> {
  if (!keyed) {
    return null;
  }
  const gender =
    keyed.persona.look === "minime"
      ? await loadMiniMeGender(db, userId)
      : "female";
  return { ...keyed, gender };
}
