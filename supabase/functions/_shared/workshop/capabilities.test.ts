import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  capabilityReport,
  connectedProviders,
  imageProvidersFor,
} from "./capabilities.ts";

Deno.test("only providers with a filled key count as connected", () => {
  const connected = connectedProviders({
    openai_api_key: "  ",
    google_api_key: "g",
    elevenlabs_api_key: "e",
    higgsfield_api_key_id: "id",
  });
  assertEquals(connected, {
    openai: false,
    google: true,
    anthropic: false,
    elevenlabs: true,
    higgsfield: false,
  });
  assertStrictEquals(connectedProviders({}, { openai: "sk" }).openai, true);
  assertStrictEquals(
    connectedProviders({ higgsfield_api_key_secret: "id:secret" }).higgsfield,
    true,
  );
});

Deno.test(
  "images work with any one of OpenAI, Google or ElevenLabs, tried in that order",
  () => {
    assertEquals(
      imageProvidersFor(
        connectedProviders({ elevenlabs_api_key: "e", google_api_key: "g" }),
      ),
      ["google", "elevenlabs"],
    );
    assertEquals(imageProvidersFor(connectedProviders({})), []);
  },
);

Deno.test(
  "the report says what can be made and what is missing, without key values",
  () => {
    const report = capabilityReport({
      elevenlabs_api_key: "secret-e",
      openai_api_key: "secret-o",
    });
    assertStrictEquals(report.can.images, true);
    assertStrictEquals(report.can.video, true);
    assertStrictEquals(report.can.narration, true);
    assertEquals(report.missing, []);
    assertStrictEquals(JSON.stringify(report).includes("secret"), false);

    const bare = capabilityReport({});
    assertStrictEquals(bare.can.images, false);
    assertStrictEquals(bare.can.video, false);
    assert(bare.missing.length >= 3);
  },
);

Deno.test(
  "an OpenRouter brain connection counts as a real video engine",
  () => {
    const report = capabilityReport(
      { google_api_key: "g" },
      {},
      {
        openrouter: true,
      },
    );
    assertStrictEquals(report.can.video, true);
    assertStrictEquals(report.can.video_engine, "OpenRouter (Kling 3)");
    assertStrictEquals(report.can.openrouter_video, true);
    assertStrictEquals(capabilityReport({}).can.openrouter_video, false);
  },
);

Deno.test("a Google key is enough for Gemini narration", () => {
  const report = capabilityReport({ google_api_key: "g" });
  assertStrictEquals(report.can.narration, true);
  assertStrictEquals(report.can.music, false);
});

Deno.test(
  "only an ElevenLabs key is enough for pictures, film and sound",
  () => {
    const report = capabilityReport({ elevenlabs_api_key: "e" });
    assertEquals(report.can.image_providers, ["ElevenLabs"]);
    assertStrictEquals(report.can.video, true);
    assertStrictEquals(report.brains.length, 0);
  },
);
