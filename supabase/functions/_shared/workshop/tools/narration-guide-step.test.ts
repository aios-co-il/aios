import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { guideLine } from "../narration-guide.ts";
import { NARRATION_QUESTION } from "./narration-approval.ts";
import {
  RECORDED,
  RECORDING,
  TAKE,
  VOICE,
  film,
  produce,
  rpc,
  savedVideos,
  takesInTurn,
} from "./test-narration.ts";
import { fakeDb } from "./test-fakes.ts";

const PATH = "tenant-1/client-1/item-1/narration/guide-1700000000000.webm";
const GUIDE_REPLY = { "rpc:queue_narration_guide": [{ id: "voice-run-2" }] };

Deno.test(
  "the user's recording is voiced in the chosen voice and asked about like any take",
  async () => {
    const db = fakeDb({ ...film(TAKE), ...GUIDE_REPLY });
    takesInTurn(db, [TAKE, RECORDING, RECORDED]);
    const reply = await produce(db, { userText: guideLine(PATH) });
    assertStrictEquals(reply.say_to_user, NARRATION_QUESTION);
    const queued = rpc(db, "queue_narration_guide")[0].value as Record<
      string,
      unknown
    >;
    assertEquals(queued.p_guide, { bucket: "creative-video", path: PATH });
    assertStrictEquals(queued.p_voice_id, VOICE);
    assert((queued.p_estimate as { usd: number }).usd > 0);
    // Not the narrator's reading, and nothing animated before the user hears it.
    assertStrictEquals(rpc(db, "queue_video_sound").length, 0);
    assertStrictEquals(rpc(db, "produce_video").length, 0);
    const last = savedVideos(db).at(-1) ?? {};
    assertStrictEquals(last.recorded_narration_guide, PATH);
    assertStrictEquals(last.asked_narration_run, "voice-run-2");
  },
);

Deno.test("Carmen may hand the path as guide_recording", async () => {
  const db = fakeDb({ ...film(TAKE), ...GUIDE_REPLY });
  takesInTurn(db, [TAKE, RECORDED]);
  await produce(db, {}, { guide_recording: PATH });
  assertStrictEquals(rpc(db, "queue_narration_guide").length, 1);
});

Deno.test("the recording is used in automatic mode too", async () => {
  const db = fakeDb({ ...film(TAKE, {}, "auto"), ...GUIDE_REPLY });
  takesInTurn(db, [TAKE, RECORDED]);
  const reply = await produce(db, { userText: guideLine(PATH) });
  assertStrictEquals(reply.say_to_user, NARRATION_QUESTION);
  assertStrictEquals(rpc(db, "produce_video").length, 0);
});

Deno.test(
  "a recording already voiced is not paid for again: its take is asked about",
  async () => {
    const db = fakeDb({
      ...film(TAKE, { recorded_narration_guide: PATH }),
      ...GUIDE_REPLY,
    });
    const reply = await produce(db, {}, { guide_recording: PATH });
    assertStrictEquals(reply.say_to_user, NARRATION_QUESTION);
    assertStrictEquals(rpc(db, "queue_narration_guide").length, 0);
  },
);

Deno.test(
  "refused: another project's or tenant's file, a take still recording, a talking film",
  async () => {
    for (const path of [
      PATH.replace("item-1", "item-2"),
      PATH.replace("tenant-1", "tenant-2"),
      "tenant-1/client-1/item-1/narration/voice-run.audio",
    ]) {
      const db = fakeDb({ ...film(TAKE), ...GUIDE_REPLY });
      const reply = await produce(db, { userText: guideLine(path) });
      assert(reply.error?.includes("תיקיית הקריינות"), path);
      assertStrictEquals(rpc(db, "queue_narration_guide").length, 0);
    }
    const busy = fakeDb({ ...film(RECORDING), ...GUIDE_REPLY });
    assert(
      (await produce(busy, { userText: guideLine(PATH) })).error?.includes(
        "עדיין מוקלטת",
      ),
    );
    assertStrictEquals(rpc(busy, "queue_narration_guide").length, 0);
    const talking = fakeDb({
      ...film({ ...TAKE, talking: true }),
      ...GUIDE_REPLY,
    });
    assert(
      (await produce(talking, { userText: guideLine(PATH) })).error?.includes(
        "בקול משלה",
      ),
    );
    assertStrictEquals(rpc(talking, "queue_narration_guide").length, 0);
  },
);
