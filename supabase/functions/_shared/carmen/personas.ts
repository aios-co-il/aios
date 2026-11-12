/**
 * The assistant characters every organization has (AIO-570). `carmen_personas`
 * stores an org's edits of these (by `builtin_key`) and created characters.
 * Dependency-free so the app imports the same definitions.
 */
export type PersonaLook = "orbs" | "minime" | "character";

export type BuiltinPersonaKey = "carmen" | "minime" | "aios";

export const BUILTIN_PERSONA_KEYS: Array<BuiltinPersonaKey> = [
  "carmen",
  "minime",
  "aios",
];

/** A character's runtime fields: who the assistant is for the user who picked it. */
export interface PersonaProfile {
  displayName: string;
  callWords: Array<string>;
  introLine: string;
  look: PersonaLook;
  mood: string | null;
  personality: string;
  soul: string;
  writingStyle: string;
}

export const BUILTIN_PERSONAS: Record<BuiltinPersonaKey, PersonaProfile> = {
  carmen: builtin({
    displayName: "כרמן",
    callWords: ["כרמן"],
    introLine: "אני כרמן, מנהלת השיווק שלך.",
    look: "character",
  }),
  minime: builtin({
    displayName: "מיני מי",
    callWords: ["מיני מי"],
    introLine: "אני מיני מי, העוזר האישי שלך מבית AIOS.",
    look: "minime",
  }),
  aios: builtin({
    displayName: "AIOS",
    callWords: ["AIOS", "איוס"],
    introLine: "אני AIOS, מערכת ההפעלה של הסוכנות שלך.",
    look: "orbs",
  }),
};

/** A `carmen_personas` row's fields as stored. */
export interface PersonaRowFields {
  builtin_key: string | null;
  display_name: string;
  call_words: Array<string>;
  intro_line: string | null;
  look: string;
  mood: string | null;
  personality: string | null;
  soul: string | null;
  writing_style: string | null;
}

/** Narrows a stored key to a built-in. */
export function isBuiltinPersonaKey(
  value: string | null | undefined,
): value is BuiltinPersonaKey {
  return BUILTIN_PERSONA_KEYS.some((key) => key === value);
}

/** A stored row as runtime fields; an unknown look falls back to the orb. */
export function personaFromRow(row: PersonaRowFields): PersonaProfile {
  const looks: Array<PersonaLook> = ["orbs", "minime", "character"];
  return {
    displayName: row.display_name,
    callWords: row.call_words,
    introLine: row.intro_line ?? "",
    look: looks.find((look) => look === row.look) ?? "orbs",
    mood: row.mood,
    personality: row.personality ?? "",
    soul: row.soul ?? "",
    writingStyle: row.writing_style ?? "",
  };
}

/** A built-in's defaults with empty mood, personality and soul. */
function builtin(
  fields: Pick<
    PersonaProfile,
    "displayName" | "callWords" | "introLine" | "look"
  >,
): PersonaProfile {
  return { mood: null, personality: "", soul: "", writingStyle: "", ...fields };
}
