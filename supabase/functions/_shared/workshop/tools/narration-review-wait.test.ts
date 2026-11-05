import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  APPROVE_NARRATION,
  NARRATION_COMING,
  NARRATION_QUESTION,
} from "./narration-approval.ts";
import {
  NO_TAKE,
  RECORDED,
  RECORDING,
  film,
  produce,
  rpc,
  savedVideos,
  takesInTurn,
} from "./test-narration.ts";
import { fakeDb } from "./test-fakes.ts";

/** Counts the waits between polls and returns at once. */
function sleeps() {
  const waits: Array<number> = [];
  return {
    waits,
    sleep: async (ms: number) => {
      waits.push(ms);
    },
  };
}

Deno.test(
  "the take recorded in the call is waited for and asked about in the same call",
  async () => {
    const db = fakeDb(film(NO_TAKE));
    takesInTurn(db, [NO_TAKE, RECORDING, RECORDING, RECORDED]);
    const clock = sleeps();
    const reply = await produce(db, { sleep: clock.sleep });
    assertStrictEquals(reply.say_to_user, NARRATION_QUESTION);
    assertStrictEquals(clock.waits.length, 3);
    assertStrictEquals(clock.waits[0], 2_000);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 1);
    assertStrictEquals(rpc(db, "produce_video").length, 0);
    const last = savedVideos(db).at(-1) ?? {};
    assertStrictEquals(last.asked_narration_run, "voice-run-2");
    assertStrictEquals(last.asked_narration_shown, true);
  },
);

Deno.test(
  "a take still recording after the wait tells the user to answer once it appears",
  async () => {
    const db = fakeDb(film(NO_TAKE));
    takesInTurn(db, [NO_TAKE, RECORDING]);
    const clock = sleeps();
    const reply = await produce(db, { sleep: clock.sleep });
    assertStrictEquals(reply.say_to_user, NARRATION_COMING);
    assertStrictEquals(reply.narration, "recording");
    // About 45 seconds of 2-second polls, inside the edge function's limit.
    assertStrictEquals(clock.waits.length, 23);
    assert(NARRATION_COMING.includes(APPROVE_NARRATION));
    assert(!NARRATION_COMING.includes("[[בחירה"));
    const last = savedVideos(db).at(-1) ?? {};
    assertStrictEquals(last.asked_narration_run, "voice-run-2");
    assertStrictEquals(last.asked_narration_shown, false);
    assertStrictEquals(last.asked_narration_when_ready, true);
  },
);

Deno.test("a recording that fails during the wait says why", async () => {
  const db = fakeDb(film(NO_TAKE));
  takesInTurn(db, [
    NO_TAKE,
    RECORDING,
    { ...RECORDING, last_run_status: "failed", last_run_error: "אין מפתח" },
  ]);
  const reply = await produce(db);
  assertStrictEquals(reply.narration, "failed");
  assertMatch(String(reply.error), /אין מפתח/);
  assertStrictEquals(
    savedVideos(db).at(-1)?.asked_narration_run,
    "voice-run-2",
  );
});

/** The wait ran out in turn-1 on voice-run-2, which then finished. */
const TOLD_WHEN_READY = {
  asked_narration_run: "voice-run-2",
  asked_narration_turn: "turn-1",
  asked_narration_shown: false,
  asked_narration_when_ready: true,
};

Deno.test(
  "after the wait ran out, the user's approval of the finished take starts the film",
  async () => {
    const said = fakeDb(film(RECORDED, TOLD_WHEN_READY));
    const saidReply = await produce(said, {
      lastAssistant: NARRATION_COMING,
      userText: APPROVE_NARRATION,
    });
    const words = fakeDb(film(RECORDED, TOLD_WHEN_READY));
    const wordsReply = await produce(
      words,
      { lastAssistant: NARRATION_COMING, userText: "נשמע מעולה, תמשיכי" },
      { narration_approved: true },
    );
    for (const [db, reply] of [
      [said, saidReply],
      [words, wordsReply],
    ] as const) {
      assertStrictEquals(reply.started, true, JSON.stringify(reply));
      assert(
        savedVideos(db).some(
          (video) => video.approved_narration_run === "voice-run-2",
        ),
      );
      assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    }
  },
);

Deno.test(
  "after the wait ran out: no approval on לתקן, for another take, or while still recording",
  async () => {
    const change = fakeDb(film(RECORDED, TOLD_WHEN_READY));
    await produce(change, {
      lastAssistant: NARRATION_COMING,
      userText: "לתקן",
    });
    const other = fakeDb(
      film(
        { ...RECORDED, run_id: "voice-run-3", last_run_id: "voice-run-3" },
        TOLD_WHEN_READY,
      ),
    );
    await produce(other, {
      lastAssistant: NARRATION_COMING,
      userText: APPROVE_NARRATION,
    });
    const recording = fakeDb(film(RECORDING, TOLD_WHEN_READY));
    const reply = await produce(recording, {
      lastAssistant: NARRATION_COMING,
      userText: APPROVE_NARRATION,
    });
    assertStrictEquals(reply.say_to_user, NARRATION_COMING);
    for (const db of [change, other, recording]) {
      assertStrictEquals(rpc(db, "produce_video").length, 0);
      assert(!savedVideos(db).some((video) => video.approved_narration_run));
    }
  },
);
