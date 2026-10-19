import assert from "node:assert/strict";
import test from "node:test";
import {
  composerLockedForChat,
  streamAppliesToActive,
  topicIsLive,
  topicModeLabel,
  topicTitle,
} from "./chatTopics.ts";

test("topic title falls back and collapses whitespace", () => {
  assert.equal(topicTitle(null), "שיחה חדשה");
  assert.equal(topicTitle("  היי   כרמן  "), "היי כרמן");
});

test("topic title keeps the first sentence and cuts long ones at a word", () => {
  assert.equal(
    topicTitle("תבני לי דוח לידים לשבוע שעבר. ואז תשלחי לדוד"),
    "תבני לי דוח לידים לשבוע שעבר",
  );
  assert.equal(
    topicTitle(
      "אני רוצה שתבדקי את כל הקמפיינים של הלקוח בפייסבוק ותגידי לי מה לשפר מחר",
    ),
    "אני רוצה שתבדקי את כל הקמפיינים של הלקוח…",
  );
});

test("live statuses are the ones that keep running in the background", () => {
  assert.equal(topicIsLive("idle"), false);
  assert.equal(topicIsLive("debating"), true);
  assert.equal(topicIsLive("waiting_external"), true);
  assert.equal(topicIsLive("streaming"), true);
});

test("mode labels stay short for the rail", () => {
  assert.equal(topicModeLabel("parliament"), "שולחן");
  assert.equal(topicModeLabel("direct_channel"), "ישיר");
  assert.equal(topicModeLabel("internal"), "כרמן");
});

test("stream tokens only paint the chat they were sent from", () => {
  assert.equal(streamAppliesToActive("a", "a"), true);
  assert.equal(streamAppliesToActive("a", "b"), false);
  assert.equal(streamAppliesToActive(null, "a"), false);
});

test("composer locks only an in-flight stream, not a debating history row", () => {
  assert.equal(
    composerLockedForChat({
      conversationId: "a",
      liveStreamIds: ["a"],
      status: "idle",
    }),
    true,
  );
  assert.equal(
    composerLockedForChat({
      conversationId: "b",
      liveStreamIds: ["a"],
      status: "idle",
    }),
    false,
  );
  assert.equal(
    composerLockedForChat({
      conversationId: "b",
      liveStreamIds: [],
      status: "debating",
    }),
    false,
  );
});
