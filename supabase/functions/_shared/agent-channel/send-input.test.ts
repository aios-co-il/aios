import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { parseConversationHistory, parseInputMode } from "./send-input.ts";

Deno.test(
  "parseInputMode keeps known modes and defaults the rest to typed",
  () => {
    assertStrictEquals(parseInputMode("realtime_voice"), "realtime_voice");
    assertStrictEquals(parseInputMode("transcribe_only"), "transcribe_only");
    assertStrictEquals(parseInputMode(undefined), "typed");
    assertStrictEquals(parseInputMode("voice"), "typed");
    assertStrictEquals(parseInputMode(1), "typed");
  },
);

Deno.test(
  "parseConversationHistory keeps only {role, content} string entries",
  () => {
    const ok = { role: "user", content: "hi" };
    const extra = { role: "assistant", content: "yo", ts: 1 };
    assertEquals(
      parseConversationHistory([
        ok,
        null,
        "text",
        { role: "user" },
        { role: "user", content: 3 },
        { role: 1, content: "x" },
        extra,
      ]),
      [ok, extra],
    );
  },
);

Deno.test("parseConversationHistory returns [] for non-arrays", () => {
  assertEquals(parseConversationHistory(undefined), []);
  assertEquals(parseConversationHistory({ role: "user", content: "x" }), []);
});
