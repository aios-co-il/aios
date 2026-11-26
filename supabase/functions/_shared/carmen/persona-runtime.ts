import type { DbClient } from "../supabase-clients.ts";
import {
  BUILTIN_PERSONAS,
  ORG_STYLE_SETTING_KEY,
  type PersonaProfile,
  type PersonaRowFields,
  isBuiltinPersonaKey,
  orgStylePersonaKey,
  parseOrgStyle,
  personaFromRow,
  usableCallWords,
} from "./personas.ts";

type Db = Pick<DbClient, "from">;

/**
 * Whose character a turn speaks as: a member's pick (the signed-in user, or a
 * personal WhatsApp line's owner), or the organization's choice on its main
 * WhatsApp line (AIO-654).
 */
export type PersonaSource =
  | { kind: "user"; userId: string }
  | { kind: "organization" };

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
  return source.kind === "user"
    ? loadCallerPersona(db, tenantId, source.userId)
    : loadOrgPersona(db, tenantId);
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
 * The prompt section that makes the assistant this character for the caller:
 * its name, how it introduces itself, and its personality, soul and writing
 * style. Mood is applied separately (`agentMoodPrompt`).
 */
export function personaPromptSection(persona: PersonaProfile): string {
  const lines = [
    `🎭 **הדמות שלך מול המשתמש הזה:** המשתמש בחר לעבוד איתך כ"${persona.displayName}". מולו שמך ${persona.displayName}, וכך את מציגה ומזכירה את עצמך (גם כשהפרומפט קורא לך בשם אחר). היכולות, ההרשאות וכללי האישור שלך לא משתנים.`,
  ];
  if (persona.introLine) {
    lines.push(
      `כשמציגה את עצמך, זה הבסיס (לא נוסח קבוע): "${persona.introLine}"`,
    );
  }
  if (persona.personality) {
    lines.push(`אישיות והתנהגות: ${persona.personality}`);
  }
  if (persona.soul) {
    lines.push(`נשמה / מטרת קיום: ${persona.soul}`);
  }
  if (persona.writingStyle) {
    lines.push(
      `סגנון כתיבה: ${WRITING_STYLES[persona.writingStyle] ?? persona.writingStyle}`,
    );
  }
  return `\n\n${lines.join("\n")}`;
}

const WRITING_STYLES: Record<string, string> = {
  formal: "רשמי",
  casual: "חברותי",
  professional: "מקצועי",
  playful: "משחקי",
};

/**
 * The organization's character: the Mini Me (with the organization's edit)
 * when its Carmen style is the Mini Me, else null so the line stays Carmen. It
 * reads no member's row. A failed read is logged and read as Carmen, so the
 * main line keeps answering as it does today.
 */
async function loadOrgPersona(
  db: Db,
  tenantId: string | null,
): Promise<PersonaProfile | null> {
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
  const key = orgStylePersonaKey(parseOrgStyle(data?.setting_value));
  return key ? resolvePersona(db, tenantId, null, key) : null;
}

/** The picked key as a character the user (or, with no user, the organization) may use. */
async function resolvePersona(
  db: Db,
  tenantId: string,
  userId: string | null,
  key: string,
): Promise<PersonaProfile | null> {
  const rows = await loadRows(db, tenantId);
  return pickPersona(rows, key, userId);
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
