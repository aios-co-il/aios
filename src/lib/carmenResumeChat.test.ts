import { expect, test } from "vitest";
import {
  isStaleTurn,
  liveTopicStatus,
  STALE_TURN_MS,
} from "./carmenResumeChat.ts";

const now = Date.parse("2026-10-24T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("a recent streaming turn stays live", () => {
  expect(liveTopicStatus("streaming", ago(60_000), now)).toBe("streaming");
});

test("a long-silent streaming turn counts as over", () => {
  expect(liveTopicStatus("streaming", ago(STALE_TURN_MS + 1), now)).toBe(
    "idle",
  );
});

test("other statuses pass through", () => {
  expect(liveTopicStatus("waiting_external", ago(STALE_TURN_MS * 9), now)).toBe(
    "waiting_external",
  );
  expect(liveTopicStatus(undefined, undefined, now)).toBe(undefined);
});

test("only a long-silent streaming turn is stale", () => {
  expect(isStaleTurn("streaming", ago(STALE_TURN_MS + 1), now)).toBe(true);
  expect(isStaleTurn("streaming", ago(1000), now)).toBe(false);
  expect(isStaleTurn("idle", ago(STALE_TURN_MS * 2), now)).toBe(false);
});
