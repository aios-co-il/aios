import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { queueGuide } from "./narration-queue.ts";
import type { NarrationPlan } from "./narration-take.ts";
import { fakeDb } from "./test-fakes.ts";

const PLAN = {
  narrated: true,
  newVoice: false,
  voiceId: "voice-a",
  stageId: "stage-1",
  engine: "kling",
  scenes: [],
  filmUsd: 1,
  units: 2,
} satisfies NarrationPlan;
const GUIDE = {
  bucket: "creative-video",
  path: "tenant-1/general/item-1/narration/guide-1.webm",
};

Deno.test(
  "the user's recording is queued with its voice, stage and quote",
  async () => {
    const db = fakeDb({ "rpc:queue_narration_guide": [{ id: "run-1" }] });
    const runId = await queueGuide(db, "item-1", PLAN, 0.02, GUIDE);
    assertStrictEquals(runId, "run-1");
    assertEquals(db.calls[0].value, {
      p_item_id: "item-1",
      p_guide: GUIDE,
      p_voice_id: "voice-a",
      p_estimate: { usd: 0.02, credits: 0 },
      p_stage_id: "stage-1",
    });
  },
);

Deno.test("nothing queued, or a refused call, is no run", async () => {
  const empty = fakeDb({ "rpc:queue_narration_guide": [] });
  assertStrictEquals(
    await queueGuide(empty, "item-1", PLAN, 0.02, GUIDE),
    null,
  );
  const refused = fakeDb({ "rpc:queue_narration_guide:error": "22023" });
  assertStrictEquals(
    await queueGuide(refused, "item-1", PLAN, 0.02, GUIDE),
    null,
  );
});
