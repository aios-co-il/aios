import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "a production that fails at once leaves no spinning film page",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "failed", error: "narration missing" },
    });
    const failed = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(failed.success, false);
    assertStrictEquals(failed.error, "narration missing");
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          (c.value as Record<string, any>)?.kind === "film",
      ),
      false,
    );
  },
);

/** fakeDb whose work item keeps the payload last written to it, as the database would. */
function savingDb(script: Record<string, any>) {
  const db = fakeDb(script);
  const from = db.from;
  db.from = (table: string) => {
    const builder = from(table) as Record<string, any>;
    if (table !== "marketing_work_items") return builder;
    const update = builder.update as (value: unknown) => unknown;
    builder.update = (value: Record<string, any>) => {
      if (value?.payload)
        script["marketing_work_items:select"] = {
          ...script["marketing_work_items:select"],
          payload: value.payload,
        };
      return update(value);
    };
    return builder;
  };
  return db;
}

Deno.test(
  "a production that never started gives its quote back to the budget",
  async () => {
    const produce = async (answer: Record<string, unknown>) => {
      const script: Record<string, any> = {
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
        ...answer,
      };
      script["marketing_work_items:select"].payload.workshop_budget = {
        cap_usd: 20,
        spent_usd: 1,
        unit_usd: {},
      };
      await executeApprovedWorkshopTool(
        savingDb(script),
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1" },
        async () => {},
        null,
        { defaultEngine: async () => "elevenlabs" as const },
      );
      return script["marketing_work_items:select"].payload.workshop_budget;
    };
    for (const answer of [
      { "rpc:produce_video:error": "stage missing" },
      {
        "rpc:produce_video": {
          status: "failed",
          error: "no clips to assemble",
        },
      },
      // Another production already runs: this call queued nothing.
      {
        "rpc:produce_video": {
          status: "running",
          clips: 0,
          voices: 0,
          music: 0,
        },
      },
    ]) {
      const budget = await produce(answer);
      assertStrictEquals(budget.spent_usd, 1, JSON.stringify(answer));
    }
    // A production that started keeps its quote on the budget.
    const started = await produce({
      "rpc:produce_video": { status: "working", clips: 1 },
    });
    assert(started.spent_usd > 1);
  },
);
