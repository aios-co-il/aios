import assert from "node:assert/strict";
import test from "node:test";
import { liveTopicStatus, STALE_TURN_MS } from "./carmenResumeChat.ts";

const now = Date.parse("2026-10-24T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("a recent streaming turn stays live", () => {
  assert.equal(liveTopicStatus("streaming", ago(60_000), now), "streaming");
});

test("a long-silent streaming turn counts as over", () => {
  assert.equal(
    liveTopicStatus("streaming", ago(STALE_TURN_MS + 1), now),
    "idle",
  );
});

test("other statuses pass through", () => {
  assert.equal(
    liveTopicStatus("waiting_external", ago(STALE_TURN_MS * 9), now),
    "waiting_external",
  );
  assert.equal(liveTopicStatus(undefined, undefined, now), undefined);
});
