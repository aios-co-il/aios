import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { withConsoleErrors } from "../testing/console-errors.ts";
import { loadPersona, resolveEffectivePersona } from "./persona-runtime.ts";
import { db, row } from "./persona-runtime.test-fixture.ts";
import { BUILTIN_PERSONAS } from "./personas.ts";

describe("resolveEffectivePersona", () => {
  const minimeStyle = {
    data: { setting_value: { style: "minime" } },
    error: null,
  };
  const noPick = { data: null, error: null };

  it("gives the user's pick with its key before the organization's character", async () => {
    const client = db({
      carmen_persona_choices: { data: { persona_key: "aios" }, error: null },
      tenant_settings: minimeStyle,
    });

    assertEquals(await resolveEffectivePersona(client, "t1", "u1"), {
      picked: { key: "aios", persona: BUILTIN_PERSONAS.aios, chosenBy: "user" },
      look: "orbs",
    });
  });

  it("falls back to the organization's Mini Me when the user picked none", async () => {
    const client = db({
      carmen_persona_choices: noPick,
      tenant_settings: minimeStyle,
    });

    assertEquals(await resolveEffectivePersona(client, "t1", "u1"), {
      picked: {
        key: "minime",
        persona: BUILTIN_PERSONAS.minime,
        chosenBy: "organization",
      },
      look: "minime",
    });
  });

  it("applies the organization's edit, not the user's own version, on the fallback", async () => {
    const client = db({
      carmen_persona_choices: noPick,
      tenant_settings: minimeStyle,
      carmen_personas: {
        data: [
          row({
            id: "mine",
            builtin_key: "minime",
            owner_user_id: "u1",
            display_name: "שלי",
          }),
          row({ id: "org", builtin_key: "minime", display_name: "של הארגון" }),
        ],
        error: null,
      },
    });

    const effective = await resolveEffectivePersona(client, "t1", "u1");

    assertEquals(effective.picked?.persona.displayName, "של הארגון");
  });

  it("is Carmen herself in the organization's look with no pick and a style that is not the Mini Me", async () => {
    const client = db({
      carmen_persona_choices: noPick,
      tenant_settings: {
        data: { setting_value: { style: "character" } },
        error: null,
      },
    });

    assertEquals(await resolveEffectivePersona(client, "t1", "u1"), {
      picked: null,
      look: "character",
    });
    assertEquals(await resolveEffectivePersona(client, null, "u1"), {
      picked: null,
      look: "orbs",
    });
  });

  it("reads a failed pick lookup as no pick and still falls back", async () => {
    const client = db({
      carmen_persona_choices: { data: null, error: { message: "down" } },
      tenant_settings: minimeStyle,
    });

    const { result, logged } = await withConsoleErrors(() =>
      resolveEffectivePersona(client, "t1", "u1"),
    );

    assertEquals(result.picked?.key, "minime");
    assertStringIncludes(logged, "[persona] choice lookup failed");
  });

  it("is what loadPersona gives an effective source", async () => {
    const client = db({
      carmen_persona_choices: noPick,
      tenant_settings: minimeStyle,
    });

    assertEquals(
      await loadPersona(client, "t1", { kind: "effective", userId: "u1" }),
      BUILTIN_PERSONAS.minime,
    );
  });

  it("keeps a user source to the member's own pick, with no organization fallback", async () => {
    const client = db({
      carmen_persona_choices: noPick,
      tenant_settings: minimeStyle,
    });

    assertEquals(
      await loadPersona(client, "t1", { kind: "user", userId: "u1" }),
      null,
    );
  });
});
