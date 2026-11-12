import type { DbClient } from "../supabase-clients.ts";
import {
  BUILTIN_PERSONAS,
  type PersonaProfile,
  type PersonaRowFields,
  isBuiltinPersonaKey,
  personaFromRow,
} from "./personas.ts";

type Db = Pick<DbClient, "from">;

const ROW_FIELDS =
  "id, builtin_key, owner_user_id, display_name, call_words, intro_line, look, mood, personality, soul, writing_style";

/**
 * The character the user picked in the org (`carmen_persona_choices`), with the
 * org's edits applied, or null when they picked none. A lookup failure is logged
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
 * Every call word of a character some member of the org picked, lowercased.
 * These call the assistant in the org's WhatsApp alongside the automation's own
 * keywords; a character nobody picked adds nothing.
 */
export async function loadPickedCallWords(
  db: Db,
  tenantId: string | null,
): Promise<Array<string>> {
  if (!tenantId) {
    return [];
  }
  const { data: choices, error } = await db
    .from("carmen_persona_choices")
    .select("user_id, persona_key")
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[persona] picked call words lookup failed", error.message);
    return [];
  }
  const picks = choices ?? [];
  if (picks.length === 0) {
    return [];
  }
  const rows = await loadRows(db, tenantId);
  // Each pick counts only if its picker may use that character (their own or shared).
  const words = picks.flatMap(
    (pick) =>
      pickPersona(rows, pick.persona_key, pick.user_id)?.callWords ?? [],
  );
  return [...new Set(words.map((word) => word.trim().toLowerCase()))].filter(
    Boolean,
  );
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

/** The picked key as a character the user may use. */
async function resolvePersona(
  db: Db,
  tenantId: string,
  userId: string,
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
 * A key as a character: a built-in with the org's edit, or a created one. A
 * user's own character counts only for that user.
 */
function pickPersona(
  rows: Array<StoredRow>,
  key: string,
  userId: string,
): PersonaProfile | null {
  if (isBuiltinPersonaKey(key)) {
    const edit = rows.find((row) => row.builtin_key === key);
    return edit ? personaFromRow(edit) : BUILTIN_PERSONAS[key];
  }
  const row = rows.find((item) => item.id === key);
  if (!row || (row.owner_user_id && row.owner_user_id !== userId)) {
    return null;
  }
  return personaFromRow(row);
}
