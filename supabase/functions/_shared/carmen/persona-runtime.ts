import type { DbClient } from "../supabase-clients.ts";
import {
  BUILTIN_PERSONAS,
  ORG_STYLE_SETTING_KEY,
  type PersonaProfile,
  type PersonaRowFields,
  type PersonaLook,
  isBuiltinPersonaKey,
  orgStylePersonaKey,
  parseOrgStyle,
  personaFromRow,
} from "./personas.ts";

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

/** A character with the key it was picked by: a built-in key or a `carmen_personas` id. */
export interface KeyedPersona {
  key: string;
  persona: PersonaProfile;
}

/**
 * The service-only run-ai-agent request field that says a turn arrived on the
 * organization's main WhatsApp line, so it speaks as the organization's choice
 * of character.
 */
export const ORG_PERSONA_FIELD = "org_persona";

const ROW_FIELDS =
  "id, builtin_key, owner_user_id, display_name, call_words, intro_line, look, mood, personality, soul, writing_style";

/** The character a turn speaks as, or null when it speaks as Carmen herself. */
export function loadPersona(
  db: Db,
  tenantId: string | null,
  source: PersonaSource | null,
): Promise<PersonaProfile | null> {
  if (!source) {
    return Promise.resolve(null);
  }
  if (source.kind === "user") {
    return loadCallerPersona(db, tenantId, source.userId);
  }
  const keyed =
    source.kind === "effective"
      ? resolveEffectivePersona(db, tenantId, source.userId)
      : loadOrgPersona(db, tenantId);
  return keyed.then((found) => found?.persona ?? null);
}

/**
 * The character the user sees and talks to in the organization, by the
 * website's rule (`useCarmenAvatarStyle`): their own pick, else the
 * organization's character (`loadOrgPersona`), else null for Carmen herself.
 */
export async function resolveEffectivePersona(
  db: Db,
  tenantId: string | null,
  userId: string | null,
): Promise<KeyedPersona | null> {
  return (
    (await loadCallerPick(db, tenantId, userId)) ??
    (await loadOrgPersona(db, tenantId))
  );
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
    ? resolvePersona(db, tenantId, userId, choice.persona_key)
    : null;
}

/**
 * The organization's character: the Mini Me (with the organization's edit)
 * when its Carmen style is the Mini Me, else null so the line stays Carmen. It
 * reads no member's row. A failed read is logged and read as Carmen, so the
 * main line keeps answering as it does today.
 */
async function loadOrgPersona(
  db: Db,
  tenantId: string | null,
): Promise<KeyedPersona | null> {
  const style = await loadOrgStyle(db, tenantId);
  const key = style ? orgStylePersonaKey(style) : null;
  return tenantId && key ? resolvePersona(db, tenantId, null, key) : null;
}

/**
 * The organization's Carmen style (Settings → Branding), or null with no
 * tenant or a failed read, which is logged.
 */
export async function loadOrgStyle(
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
): Promise<KeyedPersona | null> {
  const rows = await loadRows(db, tenantId);
  const persona = pickPersona(rows, key, userId);
  return persona ? { key, persona } : null;
}

/** The org's stored characters; a failure is logged and read as none. */
async function loadRows(db: Db, tenantId: string): Promise<Array<StoredRow>> {
  const { data, error } = await db
    .from("carmen_personas")
    .select(ROW_FIELDS)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[persona] characters lookup failed", error.message);
    return [];
  }
  return data ?? [];
}

interface StoredRow extends PersonaRowFields {
  id: string;
  owner_user_id: string | null;
}

/**
 * A key as a character: a built-in as the user's own version, else the org's
 * edit, else its defaults; or a created one. A user's own row counts only for
 * that user, and never with no user.
 */
function pickPersona(
  rows: Array<StoredRow>,
  key: string,
  userId: string | null,
): PersonaProfile | null {
  if (isBuiltinPersonaKey(key)) {
    const builtinRows = rows.filter((row) => row.builtin_key === key);
    const edit =
      builtinRows.find((row) => row.owner_user_id === userId) ??
      builtinRows.find((row) => row.owner_user_id === null);
    return edit ? personaFromRow(edit) : BUILTIN_PERSONAS[key];
  }
  const row = rows.find((item) => item.id === key);
  if (!row || (row.owner_user_id && row.owner_user_id !== userId)) {
    return null;
  }
  return personaFromRow(row);
}
