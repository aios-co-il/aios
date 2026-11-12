import type { Tables } from "@/integrations/supabase/types";
import {
  BUILTIN_PERSONA_KEYS,
  BUILTIN_PERSONAS,
  type BuiltinPersonaKey,
  type PersonaProfile,
  isBuiltinPersonaKey,
  personaFromRow,
} from "../../../../supabase/functions/_shared/carmen/personas";

/** An assistant character as the app shows and edits it. */
export interface CarmenPersona extends PersonaProfile {
  /** A built-in key, or the `carmen_personas` row id of a created character. */
  key: string;
  builtinKey: BuiltinPersonaKey | null;
  /** The stored row, when the org edited a built-in or created the character. */
  rowId: string | null;
  /** Set when the character belongs to one user; null means shared with the org. */
  ownerUserId: string | null;
}

export type PersonaRow = Tables<"carmen_personas">;

/** The fields a user edits; the key and ownership come from where it is saved. */
export type PersonaDraft = PersonaProfile;

/**
 * The characters a user can pick: the built-ins with the org's edits applied,
 * then the org's shared characters and the user's own (RLS returns only those).
 */
export function mergePersonas(rows: Array<PersonaRow>): Array<CarmenPersona> {
  const builtins = BUILTIN_PERSONA_KEYS.map((key) => {
    const row = rows.find((item) => item.builtin_key === key);
    return row
      ? { ...personaFromRow(row), ...stored(row), key, builtinKey: key }
      : {
          ...BUILTIN_PERSONAS[key],
          key,
          builtinKey: key,
          rowId: null,
          ownerUserId: null,
        };
  });
  const created = rows
    .filter((row) => !isBuiltinPersonaKey(row.builtin_key))
    .map((row) => ({
      ...personaFromRow(row),
      ...stored(row),
      key: row.id,
      builtinKey: null,
    }));
  return [...builtins, ...created];
}

/** The picked character, or null when the user has not picked one (or it is gone). */
export function findPersona(
  personas: Array<CarmenPersona>,
  key: string | null | undefined,
): CarmenPersona | null {
  return personas.find((persona) => persona.key === key) ?? null;
}

/** Splits a comma-separated input into call words, without blanks or repeats. */
export function parseCallWords(input: string): Array<string> {
  const words = input
    .split(/[,،\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set(words)].slice(0, 10);
}

/** Where a stored character lives. */
function stored(row: PersonaRow) {
  return { rowId: row.id, ownerUserId: row.owner_user_id };
}
