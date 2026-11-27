import { readRunSource } from "./run-source.test-fixture.ts";
import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { ORG_PERSONA_FIELD } from "../_shared/carmen/persona-runtime.ts";
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

describe("run-ai-agent index.ts", () => {
  it("loads the turn's character from turnPersonaSource in the full brain and the fast lane", async () => {
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
    assertEquals(source.match(/loadPersona\(/g)?.length, 2);
    assertEquals(/loadCallerPersona\(/.test(source), false);
  });
});
