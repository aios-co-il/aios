import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@1/bdd";

import {
  callsOn,
  fakeDb,
  ok,
} from "../_shared/meeting-bot/video-storage-db.test-fixture.ts";
import { VIDEO_RETENTION_MS } from "../_shared/meeting-bot/video-storage.ts";
import {
  findUnstoredVideos,
  retryVideoStorage,
  VIDEO_RETRY_BATCH_SIZE,
  VIDEO_RETRY_INTERVAL_MS,
} from "./video-retry.ts";

const NOW = Date.parse("2026-11-13T12:00:00Z");
/** The timestamp the queries send for `ms`. */
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe("findUnstoredVideos", () => {
  it("selects done sessions with Recall's video, no file_path, inside the window", async () => {
    const { client, calls } = fakeDb({
      meeting_bot_sessions: [
        ok([{ id: "s-1", tenant_id: "t-1", zoom_recordings: {} }]),
      ],
    });

    const found = await findUnstoredVideos(client, NOW);

    assertEquals(found, [{ id: "s-1", tenant_id: "t-1" }]);
    assertEquals(callsOn(calls, "meeting_bot_sessions").slice(1), [
      ["eq", "status", "done"],
      ["not", "external_bot_id", "is", null],
      ["is", "zoom_recordings.file_path", null],
      ["not", "zoom_recordings.recording_url", "is", null],
      ["gte", "ended_at", iso(NOW - VIDEO_RETENTION_MS)],
      ["lt", "updated_at", iso(NOW - VIDEO_RETRY_INTERVAL_MS)],
      ["order", "updated_at", { ascending: true }],
      ["limit", VIDEO_RETRY_BATCH_SIZE],
    ]);
  });
});

describe("retryVideoStorage", () => {
  const realError = console.error;
  const realLog = console.log;
  let errors: Array<string> = [];

  beforeEach(() => {
    errors = [];
    console.error = (...args: Array<unknown>) => errors.push(args.join(" "));
    console.log = () => {};
  });

  afterEach(() => {
    console.error = realError;
    console.log = realLog;
  });

  it("queues the store function for each claimed session with its tenant", async () => {
    const { client, calls } = fakeDb({
      meeting_bot_sessions: [
        ok([
          { id: "s-1", tenant_id: "t-1" },
          { id: "s-2", tenant_id: "t-2" },
        ]),
        // Another sweep claimed s-2 in between.
        ok([{ id: "s-1", tenant_id: "t-1" }]),
        ok([]),
      ],
      "rpc:kick_internal_function": [ok(1)],
    });

    const result = await retryVideoStorage(NOW, client);

    assertEquals(result, { requeued: ["s-1"], expired: 0 });
    assertEquals(callsOn(calls, "rpc"), [
      [
        "kick_internal_function",
        {
          p_function: "meeting-bot-store-video",
          p_body: { session_id: "s-1", tenant_id: "t-1" },
        },
      ],
    ]);
    const claim = callsOn(calls, "meeting_bot_sessions").slice(9, 13);
    assertEquals(claim, [
      ["update", { updated_at: iso(NOW) }],
      ["in", "id", ["s-1", "s-2"]],
      ["lt", "updated_at", iso(NOW - VIDEO_RETRY_INTERVAL_MS)],
      ["select", "id, tenant_id"],
    ]);
  });

  it("fails sessions that waited on their video past the window", async () => {
    const { client, calls } = fakeDb({
      meeting_bot_sessions: [ok([]), ok([{ id: "s-3" }])],
    });

    const result = await retryVideoStorage(NOW, client);

    assertEquals(result, { requeued: [], expired: 1 });
    assertEquals(callsOn(calls, "meeting_bot_sessions").slice(-4, -1), [
      ["eq", "status", "done"],
      ["eq", "status_detail", "awaiting_video"],
      ["lt", "ended_at", iso(NOW - VIDEO_RETENTION_MS)],
    ]);
  });

  it("logs a failed lookup and lets the sweep go on", async () => {
    const { client } = fakeDb({
      meeting_bot_sessions: [{ data: null, error: { message: "db down" } }],
    });

    const result = await retryVideoStorage(NOW, client);

    assertEquals(result, { requeued: [], expired: 0 });
    assertEquals(
      errors.some((line) => line.includes("db down")),
      true,
    );
  });
});
