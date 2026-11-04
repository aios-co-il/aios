import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { executeApprovedWorkshopTool, fakeDb } from "./test-fakes.ts";

Deno.test(
  "the connections check reports what is connected and never the key values",
  async () => {
    const db = fakeDb({
      "tenant_integrations:select": {
        settings: {
          elevenlabs_api_key: "secret-eleven",
          google_api_key: "secret-g",
        },
      },
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_check_connections",
      {},
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.connected.openai, false);
    assertStrictEquals(result.connected.elevenlabs, true);
    assertEquals(result.can.image_providers, ["Google (Gemini)", "ElevenLabs"]);
    assertStrictEquals(result.can.video, true);
    assertStrictEquals(JSON.stringify(result).includes("secret"), false);

    const bare = (await executeApprovedWorkshopTool(
      fakeDb(),
      "tenant-1",
      "workshop_check_connections",
      {},
      async () => {},
      null,
      { envOpenAiKey: "sk-env" },
    )) as Record<string, any>;
    assertStrictEquals(bare.connected.openai, true);
    assertStrictEquals(bare.can.images, true);
  },
);
