import assert from "node:assert/strict";
import test from "node:test";
import { createReplyRecorder, parseReplyKey } from "./reply-recorder.ts";

test("records the conversation and the streamed answer", () => {
  const r = createReplyRecorder();
  r.observe({ type: "conversation_id", id: "c1" });
  r.observe({ type: "tool_call" });
  r.observe({ type: "token", content: "שלום " });
  r.observe({ type: "token", content: "דוד" });
  assert.equal(r.conversationId, "c1");
  assert.equal(r.reply("ignored"), "שלום דוד");
});

test("falls back to the final output when nothing streamed", () => {
  const r = createReplyRecorder();
  assert.equal(r.conversationId, null);
  assert.equal(r.reply("done"), "done");
  assert.equal(r.reply(undefined), "");
});

test("accepts only safe reply keys", () => {
  assert.equal(
    parseReplyKey("3f1c2b9e-1111-4222-8333-444455556666"),
    "3f1c2b9e-1111-4222-8333-444455556666",
  );
  assert.equal(parseReplyKey("short"), null);
  assert.equal(parseReplyKey("bad key!"), null);
  assert.equal(parseReplyKey(42), null);
});
