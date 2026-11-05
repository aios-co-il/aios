import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { NARRATION_COMING, NARRATION_QUESTION } from "./narration-approval.ts";
import {
  ASKED,
  NO_TAKE,
  TAKE,
  TAPPED,
  VOICE,
  film,
  produce,
  rpc,
  savedVideos,
} from "./test-narration.ts";
import { fakeDb, scene } from "./test-fakes.ts";

Deno.test(
  "semi-automatic: the narration is recorded alone and asked about before any clip",
  async () => {
    const db = fakeDb(film(NO_TAKE));
    const reply = await produce(db);
    assertEquals(reply.missing, ["narration"]);
    assertStrictEquals(reply.narration, "recording");
    assertStrictEquals(reply.say_to_user, NARRATION_COMING);
    const queued = rpc(db, "queue_video_sound")[0].value as Record<
      string,
      unknown
    >;
    assertStrictEquals(queued.p_kind, "voice");
    assertStrictEquals(queued.p_voice_id, VOICE);
    assertEquals(queued.p_scene_ids, ["s-1", "s-2"]);
    assertStrictEquals(rpc(db, "produce_video").length, 0);
    const last = savedVideos(db).at(-1) ?? {};
    assertStrictEquals(last.asked_narration_run, "voice-run-2");
    assertStrictEquals(last.asked_narration_turn, "turn-2");
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

Deno.test(
  "a narration being recorded is not recorded again, and the question waits for it",
  async () => {
    const db = fakeDb(
      film({
        ...NO_TAKE,
        last_run_id: "voice-run-2",
        last_run_status: "running",
      }),
    );
    const reply = await produce(db);
    assertStrictEquals(reply.say_to_user, NARRATION_COMING);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    assertStrictEquals(rpc(db, "produce_video").length, 0);
  },
);

Deno.test(
  "a take on the board is asked about, not paid for again",
  async () => {
    const db = fakeDb(film(TAKE));
    const reply = await produce(db);
    assertStrictEquals(reply.say_to_user, NARRATION_QUESTION);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    assertStrictEquals(rpc(db, "produce_video").length, 0);
    assertStrictEquals(
      savedVideos(db).at(-1)?.asked_narration_run,
      "voice-run-1",
    );
  },
);

Deno.test(
  "the user's tap approves the take it was asked about and the film starts on it",
  async () => {
    const db = fakeDb(film(TAKE, ASKED));
    const reply = await produce(db, TAPPED);
    assertStrictEquals(reply.started, true, JSON.stringify(reply));
    assert(
      savedVideos(db).some(
        (video) => video.approved_narration_run === "voice-run-1",
      ),
    );
    // The approved take is the film's narration: no second recording.
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
  },
);

Deno.test("an approved take is not asked about again", async () => {
  const db = fakeDb(film(TAKE, { approved_narration_run: "voice-run-1" }));
  const reply = await produce(db);
  assertStrictEquals(reply.started, true, JSON.stringify(reply));
});

Deno.test(
  "no approval: on לתקן, in the turn it was asked, or for another take",
  async () => {
    const change = fakeDb(film(TAKE, ASKED));
    assertStrictEquals(
      (await produce(change, { ...TAPPED, userText: "לתקן" })).say_to_user,
      NARRATION_QUESTION,
    );
    const sameTurn = fakeDb(
      film(TAKE, { ...ASKED, asked_narration_turn: "turn-2" }),
    );
    assertStrictEquals(
      (await produce(sameTurn, TAPPED)).say_to_user,
      NARRATION_QUESTION,
    );
    const otherTake = fakeDb(
      film(TAKE, { ...ASKED, asked_narration_run: "voice-run-0" }),
    );
    assertStrictEquals(
      (await produce(otherTake, TAPPED)).say_to_user,
      NARRATION_QUESTION,
    );
    for (const db of [change, sameTurn, otherTake]) {
      assertStrictEquals(rpc(db, "produce_video").length, 0);
    }
  },
);
