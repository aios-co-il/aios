import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { NARRATION_COMING } from "./narration-approval.ts";
import { NO_TAKE, TAKE, film, produce, rpc } from "./test-narration.ts";
import { fakeDb } from "./test-fakes.ts";

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

Deno.test(
  "a failed recording says why and records again only when asked",
  async () => {
    const failed = {
      ...NO_TAKE,
      last_run_id: "voice-run-2",
      last_run_status: "failed",
      last_run_error: "אין מפתח לקריינות",
    };
    const db = fakeDb(film(failed, { asked_narration_run: "voice-run-2" }));
    const reply = await produce(db);
    assertStrictEquals(reply.narration, "failed");
    assertMatch(String(reply.error), /אין מפתח/);
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    const again = fakeDb(film(failed, { asked_narration_run: "voice-run-2" }));
    await produce(again, {}, { redo_narration: true });
    assertStrictEquals(rpc(again, "queue_video_sound").length, 1);
  },
);

Deno.test(
  "automatic mode, a talking film and an unreadable take skip the review",
  async () => {
    const auto = fakeDb(film(NO_TAKE, {}, "auto"));
    const talking = fakeDb(film({ ...NO_TAKE, talking: true }));
    const unread = fakeDb({
      ...film(null),
      "rpc:workshop_narration_take:error": "function does not exist",
    });
    for (const db of [auto, talking, unread]) {
      const reply = await produce(db);
      assertStrictEquals(reply.started, true, JSON.stringify(reply));
      assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    }
  },
);

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
