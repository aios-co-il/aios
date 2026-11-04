import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeWorkshopTool,
  fakeDb,
  videoProject,
  scene,
  silentFilm,
} from "./test-fakes.ts";

Deno.test(
  "with no paid keys the film is produced on the free preview engine",
  async () => {
    const asked = (await executeWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(asked.engine, "mock");
    // The clips are free; narration and music still draw on the budget.
    assertStrictEquals(asked.needs_budget, true);
  },
);

Deno.test(
  "a paid engine that can fall back to OpenRouter is quoted at the OpenRouter price",
  async () => {
    const ask = async (openrouter: boolean) =>
      (await executeWorkshopTool(
        fakeDb({
          ...videoProject(),
          "marketing_video_scenes:select": silentFilm({ still_asset_id: "a" }),
        }),
        "tenant-1",
        "workshop_produce_video",
        // The fixture's look is "cinematic"; these quotes are about the clips alone.
        { item_id: "item-1", music: false, sound_design: false },
        async () => {},
        null,
        {
          defaultEngine: async () => "higgsfield" as const,
          videoConnections: async () => ({ openrouter }),
        },
      )) as Record<string, any>;
    assertStrictEquals((await ask(false)).estimated_usd, 1.8);
    const quoted = await ask(true);
    assertStrictEquals(quoted.needs_budget, true);
    assertStrictEquals(quoted.engine, "higgsfield");
    // Kling 3 for the silent scenes and Veo 3.1 for the talking one, as the worker would spend.
    assertStrictEquals(quoted.estimated_usd, 4.04);
    assertStrictEquals(quoted.step_usd, 4.04);
  },
);

Deno.test(
  "clips that are stale, failed or from the free preview are priced before a paid run",
  async () => {
    const ask = async (
      scenes: Record<string, unknown>[],
      engine: "openrouter" | "mock",
      extra: Record<string, unknown> = {},
    ) =>
      (await executeWorkshopTool(
        fakeDb({
          ...videoProject(),
          "marketing_video_scenes:select": scenes,
          ...extra,
        }),
        "tenant-1",
        "workshop_produce_video",
        // The fixture's look is "cinematic"; these quotes are about the clips alone.
        { item_id: "item-1", music: false, sound_design: false },
        async () => {},
        null,
        { defaultEngine: async () => engine },
      )) as Record<string, any>;
    const clip = (id: string, over: Record<string, unknown> = {}) =>
      scene(id, {
        still_asset_id: `still-${id}`,
        clip_asset_id: `clip-${id}`,
        voiceover_text: "",
        ...over,
      });

    const redo = await ask(
      [
        clip("s-1", { clip_stale: true }),
        clip("s-2", { status: "failed" }),
        clip("s-3"),
      ],
      "openrouter",
    );
    assertStrictEquals(redo.needs_budget, true);
    assertStrictEquals(redo.clip_seconds, 6);

    const preview = await ask([clip("s-1"), clip("s-2")], "openrouter", {
      "marketing_assets:select": [{ id: "clip-s-1" }],
    });
    assertStrictEquals(preview.needs_budget, true);
    assertStrictEquals(preview.clip_seconds, 3);

    // On the free preview itself a preview clip is finished and costs nothing.
    const free = await ask([clip("s-1")], "mock", {
      "marketing_assets:select": [{ id: "clip-s-1" }],
    });
    assertStrictEquals(free.needs_budget, undefined);
    // Trailer effects are paid for even on the free preview, so they are quoted.
    const effects = (await executeWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [clip("s-1")],
        "marketing_assets:select": [{ id: "clip-s-1" }],
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", music: false },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(effects.needs_budget, true);
    assertStrictEquals(effects.estimated_usd, 0.09);
    assertStrictEquals(effects.with_sound_effects, true);
  },
);
