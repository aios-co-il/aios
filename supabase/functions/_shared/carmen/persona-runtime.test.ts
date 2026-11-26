import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { withConsoleErrors } from "../testing/console-errors.ts";
import {
  callWordsOf,
  loadCallerPersona,
  loadPersona,
  personaPromptSection,
} from "./persona-runtime.ts";
import { BUILTIN_PERSONAS } from "./personas.ts";

interface Answer {
  data: unknown;
  error: { message: string } | null;
}

/** A client that answers each table's read with a fixed result, whatever the filters. */
function db(tables: Record<string, Answer>) {
  return {
    from: (table: string) => {
      const answer = tables[table] ?? { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve(answer),
        then: (resolve: (value: Answer) => unknown) => resolve(answer),
      };
      return query;
    },
  };
}

/** A stored character row. */
function row(fields: Record<string, unknown>) {
  return {
    id: "row-1",
    builtin_key: null,
    owner_user_id: null,
    display_name: "דמות",
    call_words: [],
    intro_line: null,
    look: "orbs",
    mood: null,
    personality: null,
    soul: null,
    writing_style: null,
    ...fields,
  };
}

describe("loadCallerPersona", () => {
  it("is null without a pick, a user or an org", async () => {
    const none = db({ carmen_persona_choices: { data: null, error: null } });
    assertEquals(await loadCallerPersona(none, "t1", "u1"), null);
    assertEquals(await loadCallerPersona(none, "t1", null), null);
    assertEquals(await loadCallerPersona(none, null, "u1"), null);
  });

  it("gives a picked built-in with the org's edit applied", async () => {
    const client = db({
      carmen_persona_choices: { data: { persona_key: "minime" }, error: null },
      carmen_personas: {
        data: [
          row({ builtin_key: "minime", display_name: "מיני", mood: "fun" }),
        ],
        error: null,
      },
    });
    const persona = await loadCallerPersona(client, "t1", "u1");
    assertEquals(persona?.displayName, "מיני");
    assertEquals(persona?.mood, "fun");
  });

  it("prefers the user's own version of a built-in over the org's edit", async () => {
    const client = db({
      carmen_persona_choices: { data: { persona_key: "minime" }, error: null },
      carmen_personas: {
        data: [
          row({ id: "org", builtin_key: "minime", display_name: "של הארגון" }),
          row({
            id: "mine",
            builtin_key: "minime",
            owner_user_id: "u1",
            display_name: "שלי",
          }),
          row({
            id: "theirs",
            builtin_key: "minime",
            owner_user_id: "u2",
            display_name: "של עמית",
          }),
        ],
        error: null,
      },
    });
    assertEquals(
      (await loadCallerPersona(client, "t1", "u1"))?.displayName,
      "שלי",
    );
    assertEquals(
      (await loadCallerPersona(client, "t1", "u3"))?.displayName,
      "של הארגון",
    );
  });

  it("gives an unedited built-in its defaults", async () => {
    const client = db({
      carmen_persona_choices: { data: { persona_key: "aios" }, error: null },
    });
    assertEquals(
      await loadCallerPersona(client, "t1", "u1"),
      BUILTIN_PERSONAS.aios,
    );
  });

  it("refuses a colleague's own character", async () => {
    const client = db({
      carmen_persona_choices: { data: { persona_key: "row-1" }, error: null },
      carmen_personas: {
        data: [row({ owner_user_id: "someone-else" })],
        error: null,
      },
    });
    assertEquals(await loadCallerPersona(client, "t1", "u1"), null);
  });

  it("answers as Carmen (null) when the lookup fails", async () => {
    const failed = db({
      carmen_persona_choices: { data: null, error: { message: "down" } },
    });
    assertEquals(await loadCallerPersona(failed, "t1", "u1"), null);
  });
});

describe("callWordsOf", () => {
  it("gives the character's call words, lowercased", () => {
    assertEquals(callWordsOf(BUILTIN_PERSONAS.aios), ["aios", "איוס"]);
  });

  it("is empty without a character", () => {
    assertEquals(callWordsOf(null), []);
  });
});

describe("loadPersona", () => {
  const minimeStyle = {
    data: { setting_value: { style: "minime" } },
    error: null,
  };

  it("gives a member's pick for a user source", async () => {
    const client = db({
      carmen_persona_choices: { data: { persona_key: "aios" }, error: null },
      tenant_settings: minimeStyle,
    });
    assertEquals(
      await loadPersona(client, "t1", { kind: "user", userId: "u1" }),
      BUILTIN_PERSONAS.aios,
    );
  });

  it("gives the Mini Me to the organization when its style is the Mini Me", async () => {
    const client = db({ tenant_settings: minimeStyle });
    assertEquals(
      await loadPersona(client, "t1", { kind: "organization" }),
      BUILTIN_PERSONAS.minime,
    );
  });

  it("applies the organization's edit of the Mini Me, never a member's own version", async () => {
    const client = db({
      tenant_settings: minimeStyle,
      carmen_personas: {
        data: [
          row({
            id: "mine",
            builtin_key: "minime",
            owner_user_id: "u1",
            display_name: "של חבר צוות",
          }),
          row({
            id: "org",
            builtin_key: "minime",
            display_name: "מיני של הארגון",
            call_words: ["מיני בוס"],
          }),
        ],
        error: null,
      },
    });
    const persona = await loadPersona(client, "t1", { kind: "organization" });
    assertEquals(persona?.displayName, "מיני של הארגון");
    assertEquals(persona?.callWords, ["מיני בוס"]);
  });

  it("keeps Carmen herself (null) for the orbs, the illustrated character and no setting", async () => {
    for (const answer of [
      { data: { setting_value: { style: "orbs" } }, error: null },
      { data: { setting_value: { style: "character" } }, error: null },
      { data: null, error: null },
    ]) {
      const client = db({ tenant_settings: answer });
      assertEquals(
        await loadPersona(client, "t1", { kind: "organization" }),
        null,
      );
    }
  });

  it("keeps Carmen herself and logs when the organization's style cannot be read", async () => {
    const client = db({
      tenant_settings: { data: null, error: { message: "down" } },
    });
    const { result, logged } = await withConsoleErrors(() =>
      loadPersona(client, "t1", { kind: "organization" }),
    );
    assertEquals(result, null);
    assertStringIncludes(logged, "[persona] organization style lookup failed");
    assertStringIncludes(logged, "down");
  });

  it("is nobody's without a source or an organization", async () => {
    const client = db({ tenant_settings: minimeStyle });
    assertEquals(await loadPersona(client, "t1", null), null);
    assertEquals(
      await loadPersona(client, null, { kind: "organization" }),
      null,
    );
  });
});

describe("persona-runtime.ts source", () => {
  it("only reads: it writes no row, calls no function and sends nothing", async () => {
    const source = await Deno.readTextFile(
      new URL("./persona-runtime.ts", import.meta.url),
    );
    assertNotMatch(
      source,
      /\.(insert|update|upsert|delete|rpc)\(|fetch\(|functions\.invoke/,
    );
    assertEquals(
      [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]).sort(),
      ["../supabase-clients.ts", "./personas.ts"],
    );
  });
});

describe("personaPromptSection", () => {
  it("names the character and keeps the rules", () => {
    const section = personaPromptSection(BUILTIN_PERSONAS.minime);
    assertMatch(section, /כ"מיני מי"/);
    assertMatch(section, /אני מיני מי/);
    assertMatch(section, /כללי האישור שלך לא משתנים/);
    assertNotMatch(section, /אישיות והתנהגות/);
  });

  it("adds personality, soul and writing style when set", () => {
    const section = personaPromptSection({
      ...BUILTIN_PERSONAS.carmen,
      personality: "חדה וישירה",
      soul: "שאף ליד לא ייפול",
      writingStyle: "playful",
    });
    assertMatch(section, /אישיות והתנהגות: חדה וישירה/);
    assertMatch(section, /נשמה \/ מטרת קיום: שאף ליד לא ייפול/);
    assertMatch(section, /סגנון כתיבה: משחקי/);
  });
});
