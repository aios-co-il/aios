import type { DbClient } from "../supabase-clients.ts";
import {
  ORG_STYLE_SETTING_KEY,
  PERSONA_LOOKS,
  type PersonaProfile,
  type PersonaLook,
  orgStylePersonaKey,
  parseOrgStyle,
  usableCallWords,
} from "./personas.ts";
import { loadStoredPersona } from "./persona-rows.ts";

type Db = Pick<DbClient, "from">;

/**
 * Whose character a turn speaks as: a member's pick only (a personal WhatsApp
 * line's owner), the organization's choice on its main WhatsApp line
 * (AIO-654), or the signed-in user's effective character in the app and voice
 * (their pick, else the organization's: `resolveEffectivePersona`).
 */
export type PersonaSource =
  | { kind: "user"; userId: string }
  | { kind: "organization" }
  | { kind: "effective"; userId: string };

/** Who chose the character a turn speaks as: the user, or the organization (its Carmen style). */
export type PersonaChooser = "user" | "organization";

/** A character with the key it was picked by (a built-in key or a `carmen_personas` id) and who picked it. */
export interface KeyedPersona {
  key: string;
  persona: PersonaProfile;
  chosenBy: PersonaChooser;
}

/** The user's effective character, and the look they see (the character's, else the organization's style). */
export interface EffectiveCharacter {
  picked: KeyedPersona | null;
  look: PersonaLook;
}

/**
 * The service-only run-ai-agent request field that says a turn arrived on the
 * organization's main WhatsApp line, so it speaks as the organization's choice
 * of character.
 */
export const ORG_PERSONA_FIELD = "org_persona";

/** The character a turn speaks as, or null when it speaks as Carmen herself. */
export async function loadPersona(
  db: Db,
  tenantId: string | null,
  source: PersonaSource | null,
): Promise<PersonaProfile | null> {
  return (await loadKeyedPersona(db, tenantId, source))?.persona ?? null;
}

/** `loadPersona` with the character's key and who chose it. */
export async function loadKeyedPersona(
  db: Db,
  tenantId: string | null,
  source: PersonaSource | null,
): Promise<KeyedPersona | null> {
  if (!source) {
    return null;
  }
  if (source.kind === "user") {
    return loadCallerPick(db, tenantId, source.userId);
  }
  const character =
    source.kind === "effective"
      ? await resolveEffectivePersona(db, tenantId, source.userId)
      : await loadOrgCharacter(db, tenantId);
  return character.picked;
}

/**
 * The character the user talks to in the organization: their own pick, else
 * the organization's character (`loadOrgCharacter`), else null for Carmen
 * herself. The website draws the same look (`useCarmenAvatarStyle`); for the
 * name it still shows the organization's assistant name when the user picked
 * none. The organization's style is read only when the user picked none.
 */
export async function resolveEffectivePersona(
  db: Db,
  tenantId: string | null,
  userId: string | null,
): Promise<EffectiveCharacter> {
  const pick = await loadCallerPick(db, tenantId, userId);
  return pick
    ? { picked: pick, look: pick.persona.look }
    : loadOrgCharacter(db, tenantId);
}

/**
 * The character the user picked in the org (`carmen_persona_choices`), with
 * their own version or the org's edit applied, or null when they picked none. A lookup failure is logged
 * and read as no pick, so Carmen answers as herself rather than not at all.
 */
export async function loadCallerPersona(
  db: Db,
  tenantId: string | null,
  userId: string | null,
): Promise<PersonaProfile | null> {
  return (await loadCallerPick(db, tenantId, userId))?.persona ?? null;
}

/** The user's pick with its key (`loadCallerPersona`). */
async function loadCallerPick(
  db: Db,
  tenantId: string | null,
  userId: string | null,
): Promise<KeyedPersona | null> {
  if (!tenantId || !userId) {
    return null;
  }
  const { data: choice, error } = await db
    .from("carmen_persona_choices")
    .select("persona_key")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[persona] choice lookup failed", error.message);
    return null;
  }
  return choice
    ? resolvePersona(db, tenantId, userId, choice.persona_key, "user")
    : null;
}

/**
 * A character's call words, lowercased. On WhatsApp they wake the line whose
 * character it is: a personal line its owner's (AIO-576), the main line the
 * organization's (AIO-654), each next to the line's own keywords.
 */
export function callWordsOf(persona: PersonaProfile | null): Array<string> {
  // Words saved before validation existed (or written around the app) are checked again here.
  const words = usableCallWords(persona?.callWords ?? []).map((word) =>
    word.trim().toLowerCase(),
  );
  return [...new Set(words)].filter(Boolean);
}

/**
 * The organization's character: the Mini Me (with the organization's edit)
 * when its Carmen style is the Mini Me, else none so the line stays Carmen,
 * with the style as the look. It reads no member's row. A failed read is
 * logged and read as Carmen in the default look, so the main line keeps
 * answering as it does today.
 */
async function loadOrgCharacter(
  db: Db,
  tenantId: string | null,
): Promise<EffectiveCharacter> {
  const style = (await loadOrgStyle(db, tenantId)) ?? PERSONA_LOOKS[0];
  const key = orgStylePersonaKey(style);
  const picked =
    tenantId && key
      ? await resolvePersona(db, tenantId, null, key, "organization")
      : null;
  return { picked, look: style };
}

/**
 * The organization's Carmen style (Settings → Branding), or null with no
 * tenant or a failed read, which is logged.
 */
async function loadOrgStyle(
  db: Db,
  tenantId: string | null,
): Promise<PersonaLook | null> {
  if (!tenantId) {
    return null;
  }
  const { data, error } = await db
    .from("tenant_settings")
    .select("setting_value")
    .eq("tenant_id", tenantId)
    .eq("setting_key", ORG_STYLE_SETTING_KEY)
    .maybeSingle();
  if (error) {
    console.error("[persona] organization style lookup failed", error.message);
    return null;
  }
  return parseOrgStyle(data?.setting_value);
}

/** The picked key as a character the user (or, with no user, the organization) may use. */
async function resolvePersona(
  db: Db,
  tenantId: string,
  userId: string | null,
  key: string,
  chosenBy: PersonaChooser,
): Promise<KeyedPersona | null> {
  const persona = await loadStoredPersona(db, tenantId, userId, key);
  return persona ? { key, persona, chosenBy } : null;
}
