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
 * The call words of the character the user picked, lowercased. They wake the
 * agent only on a WhatsApp line that user connected for themselves; the org's
 * main Carmen line keeps its own keywords (AIO-576).
 */
export async function loadCallWords(
  db: Db,
  tenantId: string | null,
  userId: string | null,
): Promise<Array<string>> {
  const persona = await loadCallerPersona(db, tenantId, userId);
  const words = (persona?.callWords ?? []).map((word) =>
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
 * A key as a character: a built-in as the user's own version, else the org's
 * edit, else its defaults; or a created one. A user's own row counts only for
 * that user.
 */
function pickPersona(
  rows: Array<StoredRow>,
  key: string,
  userId: string,
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
