import type { Tables } from "@/integrations/supabase/types";
import type { CarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";

/** The built-in characters every organization has. */
export type BuiltinPersonaKey = "carmen" | "minime" | "aios";

/** An assistant character as the app shows and edits it. */
export interface CarmenPersona {
  /** A built-in key, or the `carmen_personas` row id of a created character. */
  key: string;
  builtinKey: BuiltinPersonaKey | null;
  /** The stored row, when the org edited a built-in or created the character. */
  rowId: string | null;
  /** Set when the character belongs to one user; null means shared with the org. */
  ownerUserId: string | null;
  displayName: string;
  callWords: Array<string>;
  introLine: string;
  look: CarmenAvatarStyle;
  mood: string | null;
  personality: string;
  soul: string;
  writingStyle: string;
}

export type PersonaRow = Tables<"carmen_personas">;

/** The fields a user edits; the key and ownership come from where it is saved. */
export type PersonaDraft = Pick<
  CarmenPersona,
  | "displayName"
  | "callWords"
  | "introLine"
  | "look"
  | "mood"
  | "personality"
  | "soul"
  | "writingStyle"
>;

const LOOKS: Array<CarmenAvatarStyle> = ["orbs", "minime", "character"];

export const BUILTIN_PERSONAS: Array<CarmenPersona> = [
  builtin("carmen", {
    displayName: "כרמן",
    callWords: ["כרמן"],
    introLine: "אני כרמן, מנהלת השיווק שלך.",
    look: "character",
  }),
  builtin("minime", {
    displayName: "מיני מי",
    callWords: ["מיני מי"],
    introLine: "אני מיני מי, העוזר האישי שלך מבית AIOS.",
    look: "minime",
  }),
  builtin("aios", {
    displayName: "AIOS",
    callWords: ["AIOS", "איוס"],
    introLine: "אני AIOS, מערכת ההפעלה של הסוכנות שלך.",
    look: "orbs",
  }),
];

/**
 * The characters a user can pick: the built-ins with the org's edits applied,
 * then the org's shared characters and the user's own (RLS returns only those).
 */
export function mergePersonas(rows: Array<PersonaRow>): Array<CarmenPersona> {
  const builtins = BUILTIN_PERSONAS.map((base) => {
    const row = rows.find((item) => item.builtin_key === base.builtinKey);
    return row ? { ...base, ...fromRow(row), key: base.key } : base;
  });
  const created = rows
    .filter((row) => !row.builtin_key)
    .map((row) => ({ ...fromRow(row), key: row.id, builtinKey: null }));
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

/** A built-in's defaults. */
function builtin(
  key: BuiltinPersonaKey,
  fields: Pick<
    CarmenPersona,
    "displayName" | "callWords" | "introLine" | "look"
  >,
): CarmenPersona {
  return {
    key,
    builtinKey: key,
    rowId: null,
    ownerUserId: null,
    mood: null,
    personality: "",
    soul: "",
    writingStyle: "",
    ...fields,
  };
}

/** A stored row as a character; an unknown look falls back to the orb. */
function fromRow(row: PersonaRow): Omit<CarmenPersona, "key" | "builtinKey"> & {
  builtinKey: BuiltinPersonaKey | null;
} {
  return {
    builtinKey: isBuiltinKey(row.builtin_key) ? row.builtin_key : null,
    rowId: row.id,
    ownerUserId: row.owner_user_id,
    displayName: row.display_name,
    callWords: row.call_words,
    introLine: row.intro_line ?? "",
    look: LOOKS.find((look) => look === row.look) ?? "orbs",
    mood: row.mood,
    personality: row.personality ?? "",
    soul: row.soul ?? "",
    writingStyle: row.writing_style ?? "",
  };
}

/** Narrows a stored key to a built-in. */
function isBuiltinKey(value: string | null): value is BuiltinPersonaKey {
  return value === "carmen" || value === "minime" || value === "aios";
}
