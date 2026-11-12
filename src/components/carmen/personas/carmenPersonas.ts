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
  /** The org-level row behind this card (a built-in's org edit, or a shared character). */
  orgRowId: string | null;
}

export type PersonaRow = Tables<"carmen_personas">;

/** The fields a user edits; the key and ownership come from where it is saved. */
export type PersonaDraft = PersonaProfile;

/**
 * The characters a user can pick: each built-in as the user's own version, else
 * the org's edit, else its defaults; then the org's shared characters and the
 * user's own. Rows of other users (a super admin reads them all) are left out.
 */
export function mergePersonas(
  rows: Array<PersonaRow>,
  userId: string | null,
): Array<CarmenPersona> {
  const visible = rows.filter(
    (row) => row.owner_user_id === null || row.owner_user_id === userId,
  );
  const builtins = BUILTIN_PERSONA_KEYS.map((key) => {
    const own = visible.find(
      (item) => item.builtin_key === key && item.owner_user_id !== null,
    );
    const org = visible.find(
      (item) => item.builtin_key === key && item.owner_user_id === null,
    );
    const row = own ?? org;
    const orgRowId = org?.id ?? null;
    return row
      ? {
          ...personaFromRow(row),
          ...stored(row),
          key,
          builtinKey: key,
          orgRowId,
        }
      : {
          ...BUILTIN_PERSONAS[key],
          key,
          builtinKey: key,
          rowId: null,
          ownerUserId: null,
          orgRowId,
        };
  });
  const created = visible
    .filter((row) => !isBuiltinPersonaKey(row.builtin_key))
    .map((row) => ({
      ...personaFromRow(row),
      ...stored(row),
      key: row.id,
      builtinKey: null,
      orgRowId: row.owner_user_id === null ? row.id : null,
    }));
  return [...builtins, ...created];
}

/** Where a save goes: an update of a stored row, or a new row. */
export type SaveTarget =
  | { kind: "update"; rowId: string }
  | {
      kind: "insert";
      builtinKey: BuiltinPersonaKey | null;
      ownerUserId: string | null;
    };

/**
 * Where saving a character goes (AIO-576):
 * - saved for the org (owners and super admins): the org-level row, also when
 *   the owner has a personal version of the built-in;
 * - a character shared with the org is edited in place (only owners and super
 *   admins may; it has no personal version, so its key stays stable);
 * - the user's own row is updated;
 * - anything else, a built-in, becomes the user's own version.
 */
export function saveTarget(
  persona: CarmenPersona | null,
  forOrg: boolean,
  userId: string,
): SaveTarget {
  const sharedCreation = persona && !persona.builtinKey && persona.orgRowId;
  if (forOrg || sharedCreation) {
    return persona?.orgRowId
      ? { kind: "update", rowId: persona.orgRowId }
      : {
          kind: "insert",
          builtinKey: persona?.builtinKey ?? null,
          ownerUserId: null,
        };
  }
  if (persona?.rowId && persona.ownerUserId === userId) {
    return { kind: "update", rowId: persona.rowId };
  }
  return {
    kind: "insert",
    builtinKey: persona?.builtinKey ?? null,
    ownerUserId: userId,
  };
}

/**
 * Whether the user may open a character's editor: any built-in (an edit is
 * their own version), their own creations, and the org's shared creations only
 * for owners and super admins.
 */
export function canEditPersona(
  persona: CarmenPersona,
  userId: string | null | undefined,
  canManageOrg: boolean,
): boolean {
  return (
    Boolean(persona.builtinKey) ||
    persona.ownerUserId === userId ||
    canManageOrg
  );
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
