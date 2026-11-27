import { readRunSource } from "./run-source.test-fixture.ts";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { ORG_PERSONA_FIELD } from "../_shared/carmen/persona-runtime.ts";
import { loadPersonaSpeaker } from "../_shared/carmen/persona-speaker.ts";
import { personaPromptSection } from "../_shared/carmen/persona-prompt.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { bindRunAgentCaller } from "./caller-trust.ts";
import { LINE_OWNER, lineAsks } from "./stored-brain-pick.test-fixture.ts";
import { turnPersonaSource } from "./turn-persona.ts";

const USER = "22222222-2222-4222-8222-222222222222";

/** A turn from the org's main WhatsApp line, as runCarmenAI sends it. */
const mainLine = { surface: "whatsapp", [ORG_PERSONA_FIELD]: true };

describe("turnPersonaSource", () => {
  it("speaks as a personal line's owner, whatever else the request says", () => {
    const body = { ...lineAsks, [ORG_PERSONA_FIELD]: true };

    assertEquals(turnPersonaSource("whatsapp", body, USER), {
      kind: "user",
      userId: LINE_OWNER,
    });
  });

  it("speaks as the organization on its main WhatsApp line", () => {
    assertEquals(turnPersonaSource("whatsapp", mainLine, USER), {
      kind: "organization",
    });
  });

  it("speaks as nobody on a WhatsApp turn that names neither", () => {
    assertEquals(
      turnPersonaSource("whatsapp", { surface: "whatsapp" }, USER),
      null,
    );
  });

  it("speaks as the signed-in user's effective character in the app, and as nobody in tasks", () => {
    for (const surface of ["internal_chat", "aios"] as const) {
      assertEquals(turnPersonaSource(surface, mainLine, USER), {
        kind: "effective",
        userId: USER,
      });
    }
    assertEquals(turnPersonaSource("internal_chat", {}, null), null);
    assertEquals(turnPersonaSource("task", mainLine, USER), null);
  });

  it("is never the organization for a signed-in user's request", () => {
    const body = bindRunAgentCaller(
      { ...mainLine },
      { kind: "user", userId: USER },
    );

    assertEquals(ORG_PERSONA_FIELD in body, false);
    assertEquals(body.surface, "internal_chat");
  });
});

describe("an app chat turn's character", () => {
  it("is the organization's Mini Me, speaking in the masculine, for a user who picked none", async () => {
    const db = fakeSupabase({
      tenant_settings: [
        {
          tenant_id: "t1",
          setting_key: "carmen_avatar_style",
          setting_value: { style: "minime" },
        },
      ],
      profiles: [{ id: USER, minime_gender: null, gender: "male" }],
    });

    const source = turnPersonaSource("internal_chat", {}, USER);
    const speaker = await loadPersonaSpeaker(db, "t1", source);

    assertEquals(speaker?.key, "minime");
    assertEquals(speaker?.chosenBy, "organization");
    assertEquals(speaker?.gender, "male");
    const section = speaker ? personaPromptSection(speaker) : "";
    assertStringIncludes(section, 'הדמות שהארגון בחר עבורך היא "מיני מי"');
    assertStringIncludes(section, "דבר על עצמך בלשון זכר");
  });
});

describe("run-ai-agent index.ts", () => {
  it("loads the turn's character and its gender from turnPersonaSource in the full brain and the fast lane", async () => {
    const source = [
      readRunSource("resolve-run-caller"),
      readRunSource("append-run-skins"),
      await Deno.readTextFile(new URL("./index.ts", import.meta.url)),
    ].join("\n");

    assertEquals(
      source.match(
        /turnPersonaSource\(\s*surface,\s*bodyJson,\s*callerUserId,?\s*\)/g,
      )?.length,
      1,
    );
    assertEquals(source.match(/loadPersonaSpeaker\(/g)?.length, 2);
    assertEquals(/loadPersona\(/.test(source), false);
    assertEquals(/loadCallerPersona\(/.test(source), false);
  });
});
