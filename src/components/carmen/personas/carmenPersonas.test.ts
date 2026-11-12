import { describe, expect, it } from "vitest";
import {
  type PersonaRow,
  findPersona,
  mergePersonas,
  parseCallWords,
  canEditPersona,
  saveTarget,
} from "./carmenPersonas";

describe("mergePersonas", () => {
  it("lists the three built-ins when the org stored nothing", () => {
    const keys = mergePersonas([], "me").map((persona) => persona.key);
    expect(keys).toEqual(["carmen", "minime", "aios"]);
  });

  it("applies the org's edit to a built-in and keeps its key", () => {
    const [, minime] = mergePersonas(
      [
        row({
          builtin_key: "minime",
          display_name: "מיני",
          call_words: ["מיני"],
        }),
      ],
      "me",
    );
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
    const personas = mergePersonas(
      [
        row({
          id: "own-1",
          owner_user_id: "me",
          display_name: "שלי",
          look: "character",
        }),
      ],
      "me",
    );
    expect(personas).toHaveLength(4);
    expect(personas[3]).toMatchObject({
      key: "own-1",
      builtinKey: null,
      ownerUserId: "me",
      look: "character",
    });
  });

  it("reads an unknown stored look as the orb", () => {
    const personas = mergePersonas([row({ id: "x", look: "hologram" })], "me");
    expect(personas[3].look).toBe("orbs");
  });
});

describe("mergePersonas with personal versions", () => {
  it("shows the user's own version of a built-in over the org's edit", () => {
    const [, minime] = mergePersonas(
      [
        row({ id: "org", builtin_key: "minime", display_name: "של הארגון" }),
        row({
          id: "mine",
          builtin_key: "minime",
          owner_user_id: "me",
          display_name: "שלי",
        }),
      ],
      "me",
    );
    expect(minime).toMatchObject({
      key: "minime",
      rowId: "mine",
      ownerUserId: "me",
      displayName: "שלי",
    });
  });

  it("leaves out other users' rows that a super admin can read", () => {
    const personas = mergePersonas(
      [
        row({
          id: "theirs",
          builtin_key: "aios",
          owner_user_id: "u2",
          display_name: "של עמית",
        }),
        row({ id: "their-own", owner_user_id: "u2" }),
      ],
      "me",
    );
    expect(personas).toHaveLength(3);
    expect(personas[2].displayName).toBe("AIOS");
  });
});

describe("saveTarget", () => {
  const [carmen] = mergePersonas([], "me");
  const orgEdit = mergePersonas(
    [row({ id: "org", builtin_key: "minime" })],
    "me",
  )[1];
  const mine = mergePersonas(
    [row({ id: "mine", builtin_key: "minime", owner_user_id: "me" })],
    "me",
  )[1];

  it("updates the user's own row", () => {
    expect(saveTarget(mine, false, "me")).toEqual({
      kind: "update",
      rowId: "mine",
    });
  });

  it("turns a member's edit of a built-in or the org's edit into their own version", () => {
    expect(saveTarget(carmen, false, "me")).toEqual({
      kind: "insert",
      builtinKey: "carmen",
      ownerUserId: "me",
    });
    expect(saveTarget(orgEdit, false, "me")).toEqual({
      kind: "insert",
      builtinKey: "minime",
      ownerUserId: "me",
    });
  });

  it("saves for the org when an owner chose it", () => {
    expect(saveTarget(orgEdit, true, "me")).toEqual({
      kind: "update",
      rowId: "org",
    });
    expect(saveTarget(carmen, true, "me")).toEqual({
      kind: "insert",
      builtinKey: "carmen",
      ownerUserId: null,
    });
    expect(saveTarget(null, true, "me")).toEqual({
      kind: "insert",
      builtinKey: null,
      ownerUserId: null,
    });
  });

  it("saves an owner's org choice to the org row even over their own version", () => {
    const both = mergePersonas(
      [
        row({ id: "org", builtin_key: "minime" }),
        row({ id: "mine", builtin_key: "minime", owner_user_id: "me" }),
      ],
      "me",
    )[1];
    expect(saveTarget(both, true, "me")).toEqual({
      kind: "update",
      rowId: "org",
    });
    expect(saveTarget(both, false, "me")).toEqual({
      kind: "update",
      rowId: "mine",
    });
  });

  it("edits a shared creation in place, never as a personal copy", () => {
    const shared = mergePersonas([row({ id: "shared" })], "me")[3];
    expect(saveTarget(shared, false, "me")).toEqual({
      kind: "update",
      rowId: "shared",
    });
  });

  it("creates a new character for the user by default", () => {
    expect(saveTarget(null, false, "me")).toEqual({
      kind: "insert",
      builtinKey: null,
      ownerUserId: "me",
    });
  });
});

describe("canEditPersona", () => {
  it("lets a member edit built-ins and their own, and only owners the org's creations", () => {
    const [carmen, , , shared, mine] = mergePersonas(
      [row({ id: "shared" }), row({ id: "own", owner_user_id: "me" })],
      "me",
    );
    expect(canEditPersona(carmen, "me", false)).toBe(true);
    expect(canEditPersona(mine, "me", false)).toBe(true);
    expect(canEditPersona(shared, "me", false)).toBe(false);
    expect(canEditPersona(shared, "me", true)).toBe(true);
  });
});

describe("findPersona", () => {
  it("is null without a pick or when the picked character is gone", () => {
    const personas = mergePersonas([], "me");
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
