import { describe, expect, it } from "vitest";
import {
  type PersonaRow,
  findPersona,
  mergePersonas,
  parseCallWords,
} from "./carmenPersonas";

describe("mergePersonas", () => {
  it("lists the three built-ins when the org stored nothing", () => {
    const keys = mergePersonas([]).map((persona) => persona.key);
    expect(keys).toEqual(["carmen", "minime", "aios"]);
  });

  it("applies the org's edit to a built-in and keeps its key", () => {
    const [, minime] = mergePersonas([
      row({
        builtin_key: "minime",
        display_name: "מיני",
        call_words: ["מיני"],
      }),
    ]);
    expect(minime).toMatchObject({
      key: "minime",
      builtinKey: "minime",
      rowId: "row-1",
      displayName: "מיני",
      callWords: ["מיני"],
      look: "minime",
    });
  });

  it("adds created characters after the built-ins, keyed by their row id", () => {
    const personas = mergePersonas([
      row({
        id: "own-1",
        owner_user_id: "me",
        display_name: "שלי",
        look: "character",
      }),
    ]);
    expect(personas).toHaveLength(4);
    expect(personas[3]).toMatchObject({
      key: "own-1",
      builtinKey: null,
      ownerUserId: "me",
      look: "character",
    });
  });

  it("reads an unknown stored look as the orb", () => {
    const personas = mergePersonas([row({ id: "x", look: "hologram" })]);
    expect(personas[3].look).toBe("orbs");
  });
});

describe("findPersona", () => {
  it("is null without a pick or when the picked character is gone", () => {
    const personas = mergePersonas([]);
    expect(findPersona(personas, null)).toBeNull();
    expect(findPersona(personas, "deleted-row")).toBeNull();
    expect(findPersona(personas, "aios")?.displayName).toBe("AIOS");
  });
});

describe("parseCallWords", () => {
  it("splits on commas, trims, and drops blanks and repeats", () => {
    expect(parseCallWords(" מיני מי, מיני ,, מיני מי")).toEqual([
      "מיני מי",
      "מיני",
    ]);
  });
});

/** A stored row with defaults. */
function row(fields: Partial<PersonaRow>): PersonaRow {
  return {
    id: "row-1",
    tenant_id: "t1",
    owner_user_id: null,
    builtin_key: null,
    display_name: "דמות",
    call_words: [],
    intro_line: null,
    look: "minime",
    mood: null,
    personality: null,
    soul: null,
    writing_style: null,
    updated_by: null,
    created_at: "2026-11-12T00:00:00Z",
    updated_at: "2026-11-12T00:00:00Z",
    ...fields,
  };
}
