import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { connectedSceneEngines, settleEngine } from "./engine-choice.ts";

const images = { imageEngines: () => Promise.resolve(["openai" as const]) };

Deno.test(
  "every image tool drops an engine that is not connected and says so",
  async () => {
    for (const name of [
      "workshop_storyboard",
      "workshop_make_stills",
      "workshop_make_creative",
    ]) {
      const settled = await settleEngine(
        name,
        { item_id: "i", engine: "google" },
        images,
      );
      assertEquals(settled.args, { item_id: "i" }, name);
      assertStrictEquals(
        settled.note,
        'המנוע "google" לא מחובר, אז השרת בחר מנוע מחובר בעצמו.',
      );
    }
  },
);

Deno.test("a connected engine is kept under its id", async () => {
  const settled = await settleEngine(
    "workshop_make_creative",
    { engine: "GPT" },
    images,
  );
  assertEquals(settled, { args: { engine: "openai" } });
  assertEquals(await settleEngine("workshop_make_stills", {}, images), {
    args: {},
  });
  // Tools without an engine choice are left alone.
  assertEquals(
    await settleEngine("workshop_get_state", { engine: "x" }, images),
    { args: { engine: "x" } },
  );
});

Deno.test(
  "the film keeps a connected scene engine and drops the others",
  async () => {
    const deps = {
      sceneEngines: () =>
        Promise.resolve(connectedSceneEngines({}, { openrouter: true })),
    };
    assertEquals(
      await settleEngine(
        "workshop_produce_video",
        { engine: "openrouter" },
        deps,
      ),
      { args: { engine: "openrouter" } },
    );
    const dropped = await settleEngine(
      "workshop_produce_video",
      { item_id: "i", engine: "higgsfield" },
      deps,
    );
    assertEquals(dropped.args, { item_id: "i" });
    assertStrictEquals(typeof dropped.note, "string");
  },
);

Deno.test(
  "a film sent to Kling with no Kling keys anywhere goes to a connected engine",
  async () => {
    // Staging, 1 Nov: no tenant or worker Kling keys, an OpenRouter brain connected.
    const deps = {
      sceneEngines: () =>
        Promise.resolve(connectedSceneEngines({}, { openrouter: true })),
    };
    const settled = await settleEngine(
      "workshop_produce_video",
      { item_id: "i", engine: "kling" },
      deps,
    );
    assertEquals(settled.args, { item_id: "i" });
    assertStrictEquals(typeof settled.note, "string");
  },
);

Deno.test("connected scene engines follow the tenant's keys", () => {
  // No Kling keys anywhere: a film sent to Kling would fail in the worker, so it is not offered.
  assertEquals(connectedSceneEngines({}), ["mock"]);
  assertEquals(
    connectedSceneEngines({ kling_access_key: "a", kling_secret_key: "s" }),
    ["mock", "kling"],
  );
  // The worker of this environment holds the keys (RENDER_WORKER_KLING=1).
  assertEquals(connectedSceneEngines({}, {}, true), ["mock", "kling"]);
  assertEquals(
    connectedSceneEngines(
      {
        elevenlabs_api_key: "e",
        kling_access_key: "a",
        kling_secret_key: "s",
        higgsfield_api_key_id: "id",
        higgsfield_api_key_secret: "secret",
      },
      { openrouter: true },
    ),
    ["mock", "kling", "openrouter", "elevenlabs", "higgsfield"],
  );
});
