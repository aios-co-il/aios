import { assertStrictEquals } from "jsr:@std/assert@1";
import { createReplyRecorder, parseReplyKey } from "./reply-recorder.ts";

Deno.test("records the conversation and the streamed answer", () => {
  const r = createReplyRecorder();
  r.observe({ type: "conversation_id", id: "c1" });
  r.observe({ type: "tool_call" });
  r.observe({ type: "token", content: "שלום " });
  r.observe({ type: "token", content: "דוד" });
  assertStrictEquals(r.conversationId, "c1");
  assertStrictEquals(r.reply("ignored"), "שלום דוד");
});

Deno.test("falls back to the final output when nothing streamed", () => {
  const r = createReplyRecorder();
  assertStrictEquals(r.conversationId, null);
  assertStrictEquals(r.reply("done"), "done");
  assertStrictEquals(r.reply(undefined), "");
});

Deno.test("accepts only safe reply keys", () => {
  assertStrictEquals(
    parseReplyKey("3f1c2b9e-1111-4222-8333-444455556666"),
    "3f1c2b9e-1111-4222-8333-444455556666",
  );
  assertStrictEquals(parseReplyKey("short"), null);
  assertStrictEquals(parseReplyKey("bad key!"), null);
  assertStrictEquals(parseReplyKey(42), null);
});
