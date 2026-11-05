import { expect, test } from "vitest";
import {
  composerLockedForChat,
  streamAppliesToActive,
  topicIsLive,
  topicModeLabel,
  topicTitle,
} from "./chatTopics.ts";

test("topic title falls back and collapses whitespace", () => {
  expect(topicTitle(null)).toBe("שיחה חדשה");
  expect(topicTitle("  היי   כרמן  ")).toBe("היי כרמן");
});

test("topic title keeps the first sentence and cuts long ones at a word", () => {
  expect(topicTitle("תבני לי דוח לידים לשבוע שעבר. ואז תשלחי לדוד")).toBe(
    "תבני לי דוח לידים לשבוע שעבר",
  );
  expect(
    topicTitle(
      "אני רוצה שתבדקי את כל הקמפיינים של הלקוח בפייסבוק ותגידי לי מה לשפר מחר",
    ),
  ).toBe("אני רוצה שתבדקי את כל הקמפיינים של הלקוח…");
  expect(topicTitle("תבדקי את example.com")).toBe("תבדקי את example.com");
  expect(topicTitle("מה קורה? ספרי לי")).toBe("מה קורה");
});

test("live statuses are the ones that keep running in the background", () => {
  expect(topicIsLive("idle")).toBe(false);
  expect(topicIsLive("debating")).toBe(true);
  expect(topicIsLive("waiting_external")).toBe(true);
  expect(topicIsLive("streaming")).toBe(true);
});

test("mode labels stay short for the rail", () => {
  expect(topicModeLabel("parliament")).toBe("שולחן");
  expect(topicModeLabel("direct_channel")).toBe("ישיר");
  expect(topicModeLabel("internal")).toBe("כרמן");
});

test("stream tokens only paint the chat they were sent from", () => {
  expect(streamAppliesToActive("a", "a")).toBe(true);
  expect(streamAppliesToActive("a", "b")).toBe(false);
  expect(streamAppliesToActive(null, "a")).toBe(false);
});

test("composer locks only an in-flight stream, not a debating history row", () => {
  expect(
    composerLockedForChat({
      conversationId: "a",
      liveStreamIds: ["a"],
      status: "idle",
    }),
  ).toBe(true);
  expect(
    composerLockedForChat({
      conversationId: "b",
      liveStreamIds: ["a"],
      status: "idle",
    }),
  ).toBe(false);
  expect(
    composerLockedForChat({
      conversationId: "b",
      liveStreamIds: [],
      status: "debating",
    }),
  ).toBe(false);
});

test("a reopened chat stays locked while its turn runs on the server", () => {
  expect(
    composerLockedForChat({
      conversationId: "a",
      liveStreamIds: [],
      status: "streaming",
    }),
  ).toBe(true);
  expect(
    composerLockedForChat({
      conversationId: "a",
      liveStreamIds: ["a"],
      status: "streaming",
      stale: true,
    }),
  ).toBe(false);
});
