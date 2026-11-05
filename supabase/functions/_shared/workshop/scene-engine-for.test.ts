import { assertStrictEquals } from "jsr:@std/assert@1";
import { engineFromKeys, sceneEngineFor } from "./scene-engine-for.ts";

Deno.test("the engine follows the keys the tenant has", () => {
  assertStrictEquals(
    engineFromKeys({ elevenlabs_api_key: "xi-1" }),
    "elevenlabs",
  );
  assertStrictEquals(
    engineFromKeys({
      higgsfield_api_key_id: "a",
      higgsfield_api_key_secret: "b",
    }),
    "higgsfield",
  );
  assertStrictEquals(engineFromKeys({ higgsfield_api_key_id: "a" }), "mock");
  assertStrictEquals(
    engineFromKeys({ higgsfield_api_key_secret: "id-1:secret-1" }),
    "higgsfield",
  );
  assertStrictEquals(engineFromKeys({}), "mock");
});

Deno.test("Starter ElevenLabs video moves to Higgsfield", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ tier: "starter" }), {
      status: 200,
    })) as typeof fetch;
  assertStrictEquals(
    await sceneEngineFor(
      {
        elevenlabs_api_key: "xi",
        higgsfield_api_key_id: "a",
        higgsfield_api_key_secret: "b",
      },
      fetchImpl,
    ),
    "higgsfield",
  );
  assertStrictEquals(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, fetchImpl),
    "mock",
  );
  const pro = (async () =>
    new Response(JSON.stringify({ tier: "pro" }), {
      status: 200,
    })) as typeof fetch;
  assertStrictEquals(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, pro),
    "elevenlabs",
  );
});

Deno.test(
  "a connected OpenRouter brain is the video engine before ElevenLabs and Higgsfield",
  async () => {
    const openrouter = { openrouter: true };
    assertStrictEquals(engineFromKeys({}, openrouter), "openrouter");
    assertStrictEquals(
      engineFromKeys({ elevenlabs_api_key: "xi" }, openrouter),
      "openrouter",
    );
    assertStrictEquals(
      engineFromKeys({ higgsfield_api_key_secret: "a:b" }, openrouter),
      "openrouter",
    );
    assertStrictEquals(
      engineFromKeys({ elevenlabs_api_key: "xi" }),
      "elevenlabs",
    );
    assertStrictEquals(
      await sceneEngineFor(
        { higgsfield_api_key_id: "a", higgsfield_api_key_secret: "b" },
        fetch,
        openrouter,
      ),
      "openrouter",
    );
    const starter = (async () =>
      new Response(JSON.stringify({ tier: "starter" }), {
        status: 200,
      })) as typeof fetch;
    assertStrictEquals(
      await sceneEngineFor({ elevenlabs_api_key: "xi" }, starter, openrouter),
      "openrouter",
    );
    assertStrictEquals(
      await sceneEngineFor({}, starter, openrouter),
      "openrouter",
    );
    assertStrictEquals(await sceneEngineFor({}, starter), "mock");
  },
);
