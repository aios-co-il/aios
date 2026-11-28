import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { fakeSupabase } from "../testing/fake-supabase.ts";
import { loadPersonaSpeaker } from "./persona-speaker.ts";
import { BUILTIN_PERSONAS } from "./personas.ts";

const USER = "u1";

/** The organization's Carmen style row. */
function style(value: string) {
  return {
    tenant_id: "t1",
    setting_key: "carmen_avatar_style",
    setting_value: { style: value },
  };
}

describe("loadPersonaSpeaker", () => {
  it("gives the organization's Mini Me to a user who picked none, in their Mini Me set", async () => {
    const db = fakeSupabase({
      tenant_settings: [style("minime")],
      profiles: [{ id: USER, minime_gender: "female", gender: "male" }],
    });

    const speaker = await loadPersonaSpeaker(db, "t1", {
      kind: "effective",
      userId: USER,
    });

    assertEquals(speaker, {
      key: "minime",
      persona: BUILTIN_PERSONAS.minime,
      chosenBy: "organization",
      gender: "female",
    });
  });

  it("makes the main WhatsApp line's Mini Me male, with no profile to read", async () => {
    const db = fakeSupabase({ tenant_settings: [style("minime")] });

    const speaker = await loadPersonaSpeaker(db, "t1", {
      kind: "organization",
    });

    assertEquals(speaker?.gender, "male");
    assertEquals(
      db.queries.some((query) => query.table === "profiles"),
      false,
    );
  });

  it("keeps a picture of Carmen feminine without reading the profile", async () => {
    const db = fakeSupabase({
      carmen_persona_choices: [
        { tenant_id: "t1", user_id: USER, persona_key: "aios" },
      ],
      profiles: [{ id: USER, minime_gender: "male", gender: "male" }],
    });

    const speaker = await loadPersonaSpeaker(db, "t1", {
      kind: "user",
      userId: USER,
    });

    assertEquals(speaker?.chosenBy, "user");
    assertEquals(speaker?.gender, "female");
    assertEquals(
      db.queries.some((query) => query.table === "profiles"),
      false,
    );
  });

  it("is Carmen herself (null) without a character", async () => {
    const db = fakeSupabase({ tenant_settings: [style("orbs")] });

    assertEquals(
      await loadPersonaSpeaker(db, "t1", { kind: "effective", userId: USER }),
      null,
    );
    assertEquals(await loadPersonaSpeaker(db, "t1", null), null);
  });
});
