import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { shouldNudgeSilentTurn } from "../reply.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
  silentFilm,
} from "./test-fakes.ts";

Deno.test(
  "producing needs stills, a client, then one approval with the engine the tenant can use",
  async () => {
    const allStilled = [
      scene("s-1", { still_asset_id: "a" }),
      scene("s-2", { still_asset_id: "b", voiceover_text: "" }),
    ];

    const missing = (await executeApprovedWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [scene("s-1")],
      }),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
    )) as Record<string, any>;
    assertStrictEquals(missing.missing_stills, 1);

    const noClientDb = fakeDb({
      ...videoProject({ client_id: null, current_stage_id: null }),
      "marketing_video_scenes:select": allStilled,
      "rpc:workshop_creative_stage": [
        { pipeline_id: "pipe-general", stage_id: "stage-general" },
      ],
    });
    const noClient = (await executeApprovedWorkshopTool(
      noClientDb,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
    )) as Record<string, any>;
    assertStrictEquals(noClient.needs_budget, true);
    assertStrictEquals(noClient.needs_client, undefined);
    const stageCall = noClientDb.calls.find(
      (c) => c.table === "rpc:workshop_creative_stage",
    );
    assertStrictEquals(
      (stageCall?.value as Record<string, unknown>).p_client_id,
      null,
    );
    const linked = noClientDb.calls.find(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    )?.value as Record<string, unknown>;
    assertStrictEquals(linked.pipeline_id, "pipe-general");
    assertStrictEquals(linked.current_stage_id, "stage-general");
    assertStrictEquals(linked.client_id, undefined);

    const script = {
      ...videoProject(),
      "marketing_video_scenes:select": allStilled,
    };
    const deps = { defaultEngine: async () => "elevenlabs" as const };
    const asked = (await executeApprovedWorkshopTool(
      fakeDb(script),
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assertStrictEquals(asked.needs_budget, true);
    assertStrictEquals(asked.engine, "elevenlabs");
    assertStrictEquals(asked.with_voice, true);
    assert(asked.estimated_usd > 0);

    const db = fakeDb({
      ...script,
      "rpc:produce_video": { status: "running", clips: 2 },
    });
    const started = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assertStrictEquals(started.success, true);
    // A started film is progress: a silent model is not nudged into producing again.
    assertStrictEquals(started.started, true);
    assertStrictEquals(
      shouldNudgeSilentTurn([
        { tool: "workshop_produce_video", result: started },
      ]),
      false,
    );
    const rpc = db.calls.find((c) => c.table === "rpc:produce_video")
      ?.value as Record<string, any>;
    assertStrictEquals(rpc.p_options.provider, "elevenlabs");
    assertStrictEquals(rpc.p_options.aspect, "9:16");
    assertStrictEquals(rpc.p_options.stage_id, "stage-1");
    assertStrictEquals(rpc.p_options.with_voice, true);
    const film = db.calls.find((c) => c.table === "workshop_artifacts")
      ?.value as Record<string, any>;
    assertStrictEquals(film.kind, "film");
    assertStrictEquals(film.status, "pending");
  },
);

Deno.test(
  "producing while a production already runs does not add a second pending film",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1", { still_asset_id: "a", clip_asset_id: "c" }),
      ],
      "rpc:produce_video": { status: "running", clips: 0, voices: 0, music: 0 },
      "workshop_artifacts:select": {
        id: "film-1",
        kind: "film",
        status: "pending",
      },
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { defaultEngine: async () => "elevenlabs" as const },
    )) as Record<string, any>;
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(result.artifact.id, "film-1");
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          !Array.isArray(c.value),
      ),
      false,
    );
  },
);

Deno.test(
  "producing again while the film renders neither quotes nor charges the budget",
  async () => {
    const base = videoProject()["marketing_work_items:select"] as Record<
      string,
      any
    >;
    const db = fakeDb({
      "marketing_work_items:select": {
        ...base,
        payload: {
          ...base.payload,
          workshop_budget: { cap_usd: 5, spent_usd: 4.5 },
          video: {
            ...base.payload.video,
            production: {
              status: "running",
              provider: "openrouter",
              started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
            },
          },
        },
      },
      "marketing_video_scenes:select": silentFilm({ still_asset_id: "a" }),
      "workshop_artifacts:select": { id: "film-1", kind: "film" },
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1" },
      async () => {},
      null,
      { defaultEngine: async () => "openrouter" as const },
    )) as Record<string, any>;
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(result.needs_budget, undefined);
    assertStrictEquals(result.artifact.id, "film-1");
    assertStrictEquals(
      db.calls.some((c) => c.table === "rpc:produce_video"),
      false,
    );
    assertStrictEquals(
      db.calls.some((c) => c.table === "marketing_work_items"),
      false,
    );
  },
);
