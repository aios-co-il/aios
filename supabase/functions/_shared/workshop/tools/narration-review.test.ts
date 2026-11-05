import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  APPROVE_NARRATION,
  NARRATION_COMING,
  NARRATION_QUESTION,
} from "./narration-approval.ts";
import {
  ASKED,
  NO_TAKE,
  SCRIPT,
  TAKE,
  TAPPED,
  VOICE,
  film,
  produce,
  rpc,
  savedVideos,
} from "./test-narration.ts";
import { fakeDb } from "./test-fakes.ts";

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
    // Nothing to hear yet: the message carries no approval tap.
    assertStrictEquals(last.asked_narration_shown, false);
    assert(!NARRATION_COMING.includes(APPROVE_NARRATION));
    assertStrictEquals(last.recorded_narration_script, SCRIPT);
  },
);

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

Deno.test(
  "a tap while the take was still recording approves nothing",
  async () => {
    // The take finished after the recording message; the user tapped before hearing it.
    const recording = { ...ASKED, asked_narration_shown: false };
    for (const lastAssistant of [NARRATION_COMING, NARRATION_QUESTION]) {
      const db = fakeDb(film(TAKE, recording));
      const reply = await produce(db, { ...TAPPED, lastAssistant });
      assertStrictEquals(reply.say_to_user, NARRATION_QUESTION);
      assertStrictEquals(rpc(db, "produce_video").length, 0);
      assert(!savedVideos(db).some((video) => video.approved_narration_run));
      assertStrictEquals(savedVideos(db).at(-1)?.asked_narration_shown, true);
    }
  },
);

Deno.test(
  "a changed pronunciation, a new voice or redo_narration records the narration again",
  async () => {
    const changed = fakeDb(
      film(
        { ...TAKE, pronunciations_changed: true },
        { approved_narration_run: "voice-run-1" },
      ),
    );
    assertStrictEquals((await produce(changed)).say_to_user, NARRATION_COMING);
    const voiced = fakeDb(
      film(TAKE, { approved_narration_run: "voice-run-1" }),
    );
    await produce(voiced, {}, { voice_id: "p7J75VowGmxi3K0it9lN" });
    const redo = fakeDb(film(TAKE));
    await produce(redo, {}, { redo_narration: true });
    for (const db of [changed, voiced, redo]) {
      assertStrictEquals(rpc(db, "queue_video_sound").length, 1);
      assertStrictEquals(rpc(db, "produce_video").length, 0);
    }
    assertStrictEquals(
      (rpc(voiced, "queue_video_sound")[0].value as { p_voice_id: string })
        .p_voice_id,
      "p7J75VowGmxi3K0it9lN",
    );
  },
);

/** The recording the user was told about (voice-run-2, of SCRIPT) failed. */
const FAILED = {
  ...NO_TAKE,
  last_run_id: "voice-run-2",
  last_run_status: "failed",
  last_run_error: "אין מפתח לקריינות",
};
const FAILED_ASKED = {
  asked_narration_run: "voice-run-2",
  recorded_narration_script: SCRIPT,
};

Deno.test(
  "a failed recording says why and records again only when asked",
  async () => {
    const db = fakeDb(film(FAILED, FAILED_ASKED));
    const reply = await produce(db);
    assertStrictEquals(reply.narration, "failed");
    assertMatch(String(reply.error), /אין מפתח/);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    const again = fakeDb(film(FAILED, FAILED_ASKED));
    await produce(again, {}, { redo_narration: true });
    assertStrictEquals(rpc(again, "queue_video_sound").length, 1);
  },
);

Deno.test(
  "after a failed recording, a new voice, script or pronunciation records again",
  async () => {
    const voiced = fakeDb(film(FAILED, FAILED_ASKED));
    await produce(voiced, {}, { voice_id: "p7J75VowGmxi3K0it9lN" });
    const edited = fakeDb(
      film(FAILED, { ...FAILED_ASKED, recorded_narration_script: "קודם." }),
    );
    await produce(edited);
    const said = fakeDb(
      film({ ...FAILED, pronunciations_since_last_run: true }, FAILED_ASKED),
    );
    await produce(said);
    for (const db of [voiced, edited, said]) {
      assertStrictEquals(rpc(db, "queue_video_sound").length, 1);
      assertStrictEquals(rpc(db, "produce_video").length, 0);
    }
  },
);

Deno.test("automatic mode and a talking film skip the review", async () => {
  const auto = fakeDb(film(NO_TAKE, {}, "auto"));
  const talking = fakeDb(film({ ...NO_TAKE, talking: true }));
  for (const db of [auto, talking]) {
    const reply = await produce(db);
    assertStrictEquals(reply.started, true, JSON.stringify(reply));
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
  }
});

Deno.test(
  "a take that cannot be read stops production with the error",
  async () => {
    const db = fakeDb({
      ...film(null),
      "rpc:workshop_narration_take:error": "function does not exist",
    });
    const reply = await produce(db);
    assertMatch(String(reply.error), /function does not exist/);
    assertStrictEquals(rpc(db, "produce_video").length, 0);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
  },
);
