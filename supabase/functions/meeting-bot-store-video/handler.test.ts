import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@1/bdd";

import {
  callsOn,
  fakeDb,
  type FakeResult,
  ok,
} from "../_shared/meeting-bot/video-storage-db.test-fixture.ts";
import {
  type FreshVideo,
  handleStoreVideo,
  type StoreVideoDeps,
} from "./handler.ts";
import { StoreVideoError } from "./session.ts";

const SESSION_ROW = {
  id: "session-1",
  tenant_id: "tenant-1",
  external_bot_id: "bot-1",
  zoom_recording_id: "rec-1",
};
const PATH = "tenant-1/meeting_bot/session-1.mp4";
const BODY = { session_id: "session-1", tenant_id: "tenant-1" };

interface Harness {
  deps: StoreVideoDeps;
  calls: Array<Array<unknown>>;
  uploads: Array<string>;
  background: Array<Promise<void>>;
}

/** Deps over a fake database; the video is 3 bytes unless openVideo is given. */
function harness(
  results: Record<string, Array<FakeResult>>,
  overrides: Partial<StoreVideoDeps> = {},
): Harness {
  const { client, calls } = fakeDb(results);
  const uploads: Array<string> = [];
  const background: Array<Promise<void>> = [];
  const deps: StoreVideoDeps = {
    admin: client,
    isServiceRole: () => true,
    openVideo: () => Promise.resolve(video(3)),
    upload: (_video, path) => {
      uploads.push(path);
      return Promise.resolve();
    },
    runInBackground: (task) => background.push(task),
    ...overrides,
  };
  return { deps, calls, uploads, background };
}

/** A video body of `length` bytes. */
function video(length: number): FreshVideo {
  return { body: new Blob([new Uint8Array(length)]).stream(), length };
}

/** A POST with a JSON (or raw string) body. */
function post(body: unknown): Request {
  return new Request("https://fn.test", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleStoreVideo", () => {
  const realError = console.error;
  const realLog = console.log;
  let errors: Array<string> = [];

  beforeEach(() => {
    errors = [];
    console.error = (...args: Array<unknown>) => {
      errors.push(
        args
          .map((a) => (a instanceof Error ? a.message : JSON.stringify(a)))
          .join(" "),
      );
    };
    console.log = () => {};
  });

  afterEach(() => {
    console.error = realError;
    console.log = realLog;
  });

  it("answers 403 to a caller that is not the service role, and logs it", async () => {
    const { deps, calls } = harness({}, { isServiceRole: () => false });

    const res = await handleStoreVideo(post(BODY), deps);

    assertEquals(res.status, 403);
    assertEquals(calls, []);
    assertEquals(errors.length, 1);
  });

  it("answers 400 and logs the rejected ids when tenant_id is missing", async () => {
    const { deps, calls } = harness({});

    const res = await handleStoreVideo(post({ session_id: "s-9" }), deps);

    assertEquals(res.status, 400);
    assertEquals(calls, []);
    assertEquals(
      errors.some((line) => line.includes('"s-9"')),
      true,
    );
  });

  it("logs a body that is not JSON before answering 400", async () => {
    const { deps } = harness({});

    const res = await handleStoreVideo(post("{not json"), deps);

    assertEquals(res.status, 400);
    assertEquals(
      errors.some((line) => line.includes("not JSON")),
      true,
    );
  });

  it("loads the session within the body's tenant", async () => {
    const { deps, calls } = harness({ meeting_bot_sessions: [ok(null)] });

    const res = await handleStoreVideo(post(BODY), deps);

    assertEquals(res.status, 404);
    assertEquals(callsOn(calls, "meeting_bot_sessions").slice(1, 3), [
      ["eq", "tenant_id", "tenant-1"],
      ["eq", "id", "session-1"],
    ]);
  });

  it("uploads nothing when the recording already points at the video", async () => {
    const { deps, uploads, background } = harness({
      meeting_bot_sessions: [ok(SESSION_ROW)],
      zoom_recordings: [ok({ file_path: PATH })],
    });

    const res = await handleStoreVideo(post(BODY), deps);

    assertEquals(res.status, 200);
    assertEquals((await res.json()).reason, "already stored");
    assertEquals(uploads, []);
    assertEquals(background, []);
  });

  it("copies the video, sets file_path and resumes a session waiting on it", async () => {
    const { deps, calls, uploads, background } = harness({
      meeting_bot_sessions: [ok(SESSION_ROW), ok(null)],
      zoom_recordings: [ok({ file_path: null }), ok(null)],
    });

    const res = await handleStoreVideo(post(BODY), deps);
    await Promise.all(background);

    assertEquals(res.status, 202);
    assertEquals(uploads, [PATH]);
    assertEquals(callsOn(calls, "zoom_recordings").slice(4), [
      ["update", { file_path: PATH }],
      ["eq", "tenant_id", "tenant-1"],
      ["eq", "id", "rec-1"],
    ]);
    const resume = callsOn(calls, "meeting_bot_sessions").slice(4);
    assertEquals(resume.slice(1), [
      ["eq", "tenant_id", "tenant-1"],
      ["eq", "id", "session-1"],
      ["eq", "status", "done"],
      ["eq", "status_detail", "awaiting_video"],
    ]);
    assertEquals(errors, []);
  });

  it("answers non-2xx when Recall's video has no content-length", async () => {
    const { deps, background } = harness(
      {
        meeting_bot_sessions: [ok(SESSION_ROW)],
        zoom_recordings: [ok({ file_path: null })],
      },
      {
        openVideo: () =>
          Promise.reject(
            new StoreVideoError(
              "Recall video response has no content-length",
              502,
            ),
          ),
      },
    );

    const res = await handleStoreVideo(post(BODY), deps);

    assertEquals(res.status, 502);
    assertEquals(background, []);
  });

  it("answers a generic 500 and logs the detail of an unexpected error", async () => {
    const { deps } = harness({
      meeting_bot_sessions: [{ data: null, error: { message: "db down" } }],
    });

    const res = await handleStoreVideo(post(BODY), deps);

    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Internal error" });
    assertEquals(
      errors.some((line) => line.includes("db down")),
      true,
    );
  });

  it("logs a copy that fails after the 202", async () => {
    const { deps, background } = harness(
      {
        meeting_bot_sessions: [ok(SESSION_ROW)],
        zoom_recordings: [ok({ file_path: null })],
      },
      { upload: () => Promise.reject(new Error("TUS create failed (413)")) },
    );

    const res = await handleStoreVideo(post(BODY), deps);
    await Promise.all(background);

    assertEquals(res.status, 202);
    assertEquals(
      errors.some((line) => line.includes("copy failed")),
      true,
    );
  });
});
