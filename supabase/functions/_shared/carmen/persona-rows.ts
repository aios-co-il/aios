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
 * A picked key as a character the user (or, with no user, the organization)
 * may use, from the org's stored characters (`pickPersona`), or null.
 */
export async function loadStoredPersona(
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
