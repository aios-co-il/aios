import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { NO_TAKE, film, produce, rpc } from "./test-narration.ts";
import { fakeDb, scene } from "./test-fakes.ts";

Deno.test(
  "without a budget nothing is recorded and the budget covers the whole film",
  async () => {
    const db = fakeDb(film(NO_TAKE));
    const reply = await produce(db, { approvedOutOfBand: false } as never);
    assertStrictEquals(reply.needs_budget, true);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    // Two 3 s scenes on ElevenLabs (two 4 s clips at $0.15 a second) are in the quote.
    assert(Number((reply as { estimated_usd?: number }).estimated_usd) >= 1.2);
  },
);

Deno.test("only the narration is charged for its recording", async () => {
  const line = "א".repeat(500);
  const db = fakeDb({
    ...film(NO_TAKE),
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a", voiceover_text: line }),
      scene("s-2", { still_asset_id: "b", voiceover_text: line }),
    ],
  });
  await produce(db);
  const budgets = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map(
      (c) =>
        (c.value as { payload: { workshop_budget?: { spent_usd: number } } })
          .payload.workshop_budget,
    )
    .filter(Boolean);
  // 1000 characters at $0.12 per 1000, not the film's clips ($1.20) or music.
  assertStrictEquals(budgets.at(-1)?.spent_usd, 0.12);
  const estimate = (
    rpc(db, "queue_video_sound")[0].value as {
      p_estimate: { usd: number };
    }
  ).p_estimate;
  assertStrictEquals(estimate.usd, 0.12);
});
