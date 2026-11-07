import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  parseAttachments,
  parseConversationHistory,
  parseInputMode,
} from "./send-input.ts";

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
  "parseConversationHistory keeps object entries as role/content text",
  () => {
    assertEquals(
      parseConversationHistory([
        { role: "user", content: "hi" },
        { role: "assistant", content: "yo", ts: 1 },
        { role: "user", content: 3 },
        { role: 1, content: null },
      ]),
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "yo" },
        { role: "user", content: "3" },
        { role: "1", content: "" },
      ],
    );
  },
);

Deno.test("parseConversationHistory skips non-object entries", () => {
  assertEquals(parseConversationHistory([null, "text", 3, ["user", "hi"]]), []);
});

Deno.test("parseConversationHistory returns [] for non-arrays", () => {
  assertEquals(parseConversationHistory(undefined), []);
  assertEquals(parseConversationHistory({ role: "user", content: "x" }), []);
});

Deno.test("parseAttachments keeps named http attachments", () => {
  assertEquals(
    parseAttachments([
      { name: " a.png ", url: "https://x/a.png", type: "image", size: 10 },
      { name: "b.pdf", url: "http://x/b.pdf", path: "p/b.pdf", size: "9" },
    ]),
    [
      { name: "a.png", url: "https://x/a.png", type: "image", size: 10 },
      {
        name: "b.pdf",
        url: "http://x/b.pdf",
        type: "file",
        size: undefined,
        path: "p/b.pdf",
      },
    ],
  );
});

Deno.test("parseAttachments skips malformed items and caps at 6", () => {
  assertEquals(
    parseAttachments([
      null,
      "x",
      ["a"],
      { name: "", url: "https://x" },
      { name: "a", url: "ftp://x" },
    ]),
    [],
  );
  const many = Array.from({ length: 8 }, (_, i) => ({
    name: `f${i}`,
    url: `https://x/${i}`,
  }));
  assertEquals(parseAttachments(many).length, 6);
  assertEquals(parseAttachments("nope"), []);
});
