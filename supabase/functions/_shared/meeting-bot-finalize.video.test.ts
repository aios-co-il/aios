import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@1/bdd";

import {
  finalizeMeetingBotSession,
  type MeetingBotSession,
} from "./meeting-bot-finalize.ts";
import {
  callsOn,
  fakeDb,
  type FakeResult,
  ok,
} from "./meeting-bot/video-storage-db.test-fixture.ts";

const RECORDING = { id: "rec-1", tenant_id: "tenant-1", meeting_id: "bot-1" };

/** A session whose meeting ended `endedAgoMs` ago, with its recording row. */
function session(endedAgoMs: number): MeetingBotSession {
  return {
    id: "session-1",
    tenant_id: "tenant-1",
    client_id: null,
    lead_id: null,
    agency_id: null,
    campaigner_ids: null,
    summary_scope: "auto",
    platform: "zoom",
    meeting_topic: null,
    external_bot_id: "bot-1",
    zoom_recording_id: "rec-1",
    scheduled_start: null,
    joined_at: null,
    ended_at: new Date(Date.now() - endedAgoMs).toISOString(),
    created_by: null,
  };
}

/** Recall's answer for a bot with a video, no audio, and a failed transcript. */
function recallBotWithVideoOnly(): Response {
  return Response.json({
    recordings: [
      {
        media_shortcuts: {
          video_mixed: { data: { download_url: "https://recall.test/v.mp4" } },
          transcript: { status: { code: "failed" } },
        },
      },
    ],
  });
}

/** Queued answers: the recording update, then the file_path lookup. */
/** No earlier recording (AIO-587 lookup), the inserted row, then its file_path. */
function recordingResults(filePath: string | null): Array<FakeResult> {
  return [ok(null), ok(RECORDING), ok({ file_path: filePath })];
}

describe("finalizeMeetingBotSession with no transcript and no audio", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    Deno.env.set("RECALL_API_KEY", "recall-key");
    globalThis.fetch = () => Promise.resolve(recallBotWithVideoOnly());
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("starts the video copy and waits for it instead of failing", async () => {
    const { client, calls } = fakeDb({
      zoom_recordings: recordingResults(null),
      "rpc:kick_internal_function": [ok(1)],
    });

    const result = await finalizeMeetingBotSession(client, session(60_000));

    assertEquals(result.outcome, "awaiting_video");
    assertEquals(
      callsOn(calls, "meeting_bot_sessions")
        .filter((call) => call[0] === "update")
        .map((call) => {
          const { status, status_detail } = call[1] as Record<string, string>;
          return { status, status_detail };
        }),
      [
        { status: undefined, status_detail: undefined },
        { status: "done", status_detail: "awaiting_video" },
      ],
    );
    assertEquals(callsOn(calls, "rpc"), [
      [
        "kick_internal_function",
        {
          p_function: "meeting-bot-store-video",
          p_body: { session_id: "session-1", tenant_id: "tenant-1" },
        },
      ],
    ]);
  });

  it("looks the stored video up within the session's tenant", async () => {
    const { client, calls } = fakeDb({
      zoom_recordings: recordingResults(null),
    });

    await finalizeMeetingBotSession(client, session(60_000));

    const lookup = callsOn(calls, "zoom_recordings").slice(-4);
    assertEquals(lookup, [
      ["select", "file_path"],
      ["eq", "tenant_id", "tenant-1"],
      ["eq", "id", "rec-1"],
      ["maybeSingle"],
    ]);
  });

  it("fails the session once Recall's media is past the retention window", async () => {
    const { client, calls } = fakeDb({
      zoom_recordings: recordingResults(null),
    });

    const result = await finalizeMeetingBotSession(
      client,
      session(4 * 24 * 60 * 60 * 1000),
    );

    assertEquals(result.outcome, "failed");
    assertEquals(callsOn(calls, "rpc"), []);
  });
});
