/** The narration review's tool test fixtures (narration-review.test.ts, narration-take.test.ts). */

import { executeWorkshopTool } from "../../workshop-tools.ts";
import { APPROVE_NARRATION, NARRATION_QUESTION } from "./narration-approval.ts";
import { fakeDb, scene, videoProject } from "./test-fakes.ts";

export type Db = ReturnType<typeof fakeDb>;

/** What produce_video answers: the narration question, a failure, a budget request or a start. */
export interface Reply {
  needs_input?: boolean;
  missing?: Array<string>;
  narration?: string;
  say_to_user?: string;
  needs_budget?: boolean;
  started?: boolean;
  error?: string;
}

/** The voice the project chose (videoProject's) and a take of it on the board. */
export const VOICE = "d4eLZ8u5dfBCsjp4YPyz";
export const TAKE = {
  ready: true,
  talking: false,
  run_id: "voice-run-1",
  asset_id: "narration-1",
  pronunciations_changed: false,
  last_run_id: "voice-run-1",
  last_run_status: "completed",
  last_run_error: null,
  pronunciations_since_last_run: false,
};
export const NO_TAKE = {
  ...TAKE,
  ready: false,
  run_id: null,
  asset_id: null,
  last_run_id: null,
  last_run_status: null,
};

/** A narrated film whose pictures were approved, in `mode`, with this take; `video` adds to payload.video. */
export function film(
  take: Record<string, unknown> | null,
  video: Record<string, unknown> = {},
  mode: "auto" | "semi" = "semi",
) {
  const item = videoProject()["marketing_work_items:select"];
  return {
    "marketing_work_items:select": {
      ...item,
      payload: {
        ...item.payload,
        workshop_mode: mode,
        video: { ...item.payload.video, approved_stills: ["a", "b"], ...video },
      },
    },
    "marketing_video_scenes:select": [
      scene("s-1", {
        still_asset_id: "a",
        voiceover_text: "קופי, מדיה, מכירות.",
      }),
      scene("s-2", {
        still_asset_id: "b",
        voiceover_text: "כרמן מנהלת את הכול.",
      }),
    ],
    "rpc:workshop_narration_take": take,
    "rpc:queue_video_sound": [{ id: "voice-run-2" }],
    "rpc:produce_video": { status: "working", clips: 2 },
  };
}

/** produce_video in turn-2, the budget approved, with what the user said and Carmen last asked. */
export const produce = (
  db: Db,
  deps: {
    userText?: string;
    lastAssistant?: string;
    turnId?: string;
    sleep?: (ms: number) => Promise<void>;
  } = {},
  args: Record<string, unknown> = {},
) =>
  executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1", sound_design: false, ...args },
    async () => {},
    null,
    {
      userText: "תפיקי",
      lastAssistant: "",
      turnId: "turn-2",
      approvedOutOfBand: true,
      defaultEngine: async () => "elevenlabs" as const,
      // The take is polled while it records; tests do not wait between polls.
      sleep: async () => {},
      ...deps,
    },
  ) as Promise<Reply>;

/**
 * workshop_narration_take answers each read with the next of `takes`, then keeps the last: the
 * first read is produce_video's own, the rest are its polls while the take records.
 */
export function takesInTurn(db: Db, takes: Array<Record<string, unknown>>) {
  const read = db.rpc;
  let reads = 0;
  db.rpc = (name: string, value: unknown) => {
    if (name === "workshop_narration_take") {
      db.script["rpc:workshop_narration_take"] =
        takes[Math.min(reads++, takes.length - 1)];
    }
    return read(name, value);
  };
}

/** The take of voice-run-2 (the run film() queues) while it records, and once on the board. */
export const RECORDING = {
  ...NO_TAKE,
  last_run_id: "voice-run-2",
  last_run_status: "running",
};
export const RECORDED = {
  ...TAKE,
  run_id: "voice-run-2",
  last_run_id: "voice-run-2",
};

export const rpc = (db: Db, name: string) =>
  db.calls.filter((c) => c.table === `rpc:${name}`);

/** Every payload.video produce_video saved. */
export const savedVideos = (db: Db) =>
  db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map(
      (c) =>
        ((c.value as { payload?: { video?: Record<string, unknown> } }).payload
          ?.video ?? {}) as Record<string, unknown>,
    );

/** The narration of film()'s scenes, as recordNarration saves it with a recording. */
export const SCRIPT = "קופי, מדיה, מכירות.\nכרמן מנהלת את הכול.";

/** The user tapped approval in turn-2 on the question asked about voice-run-1 in turn-1. */
export const ASKED = {
  asked_narration_run: "voice-run-1",
  asked_narration_turn: "turn-1",
  asked_narration_shown: true,
};
export const TAPPED = {
  lastAssistant: NARRATION_QUESTION,
  userText: APPROVE_NARRATION,
};
