import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  buildCarmenMergedHistory,
  conversationMirrorMessages,
  lastAssistantReply,
  sessionHistoryEntries,
} from "./carmen-session-history.ts";

const NOW = Date.parse("2026-01-01T12:00:00.000Z");

Deno.test("sessionHistoryEntries reads only arrays", () => {
  assertEquals(sessionHistoryEntries([{ role: "user" }]), [{ role: "user" }]);
  assertEquals(sessionHistoryEntries(null), []);
  assertEquals(sessionHistoryEntries(undefined), []);
  assertEquals(sessionHistoryEntries({ role: "user" }), []);
});

Deno.test("mirror messages keep role and content of every object entry", () => {
  assertEquals(
    conversationMirrorMessages([
      { role: "user", content: "hi", timestamp: "2026-01-01T00:00:00Z" },
      { role: "system", content: "x" },
      { role: "assistant", content: [{ type: "text" }] },
      { role: "assistant", content: "hello" },
    ]),
    [
      { role: "user", content: "hi" },
      { role: "system", content: "x" },
      { role: "assistant", content: [{ type: "text" }] },
      { role: "assistant", content: "hello" },
    ],
  );
});

Deno.test("mirror messages skip non-object entries", () => {
  assertEquals(
    conversationMirrorMessages([null, "noise", 3, ["user", "hi"]]),
    [],
  );
  const [entry] = conversationMirrorMessages([{ role: "assistant" }]);
  assertStrictEquals(entry.role, "assistant");
  assertStrictEquals(entry.content, undefined);
});

Deno.test("lastAssistantReply finds the newest reply and its age", () => {
  const reply = lastAssistantReply(
    [
      { role: "assistant", content: "old", timestamp: "2026-01-01T11:00:00Z" },
      {
        role: "assistant",
        content: " new ",
        timestamp: "2026-01-01T11:59:00Z",
      },
      { role: "user", content: "q" },
    ],
    NOW,
  );
  assertEquals(reply, { text: "new", ageMs: 60_000 });
});

Deno.test("lastAssistantReply accepts numeric timestamps", () => {
  const reply = lastAssistantReply(
    [{ role: "assistant", content: "x", timestamp: NOW - 5_000 }],
    NOW,
  );
  assertStrictEquals(reply?.ageMs, 5_000);
});

Deno.test(
  "lastAssistantReply treats missing or invalid timestamps as old",
  () => {
    for (const timestamp of [undefined, null, "not a date", true]) {
      const reply = lastAssistantReply(
        [
          {
            role: "assistant",
            content: "x",
            ...(timestamp === undefined ? {} : { timestamp }),
          },
        ],
        NOW,
      );
      assertStrictEquals(reply?.ageMs, Number.MAX_SAFE_INTEGER);
    }
  },
);

Deno.test("lastAssistantReply is null without reply text", () => {
  assertStrictEquals(lastAssistantReply([], NOW), null);
  assertStrictEquals(
    lastAssistantReply([{ role: "user", content: "q" }], NOW),
    null,
  );
  assertStrictEquals(
    lastAssistantReply([{ role: "assistant", content: "" }], NOW),
    null,
  );
});

Deno.test(
  "merged history drops context overlapping the session by timestamp",
  () => {
    const session = [
      { role: "user", content: "s1", timestamp: "2026-01-01T10:00:00Z" },
      { role: "assistant", content: "s2", timestamp: 5 },
    ];
    const merged = buildCarmenMergedHistory(
      [
        { role: "user", content: "older", timestamp: "2026-01-01T09:00:00Z" },
        { role: "user", content: "same", timestamp: "2026-01-01T10:00:00Z" },
        { role: "user", content: "newer", timestamp: "2026-01-01T11:00:00Z" },
        { role: "user", content: "untimed" },
      ],
      session,
    );
    assertStrictEquals(merged.length, 5);
    assertEquals(merged.slice(1), [
      { role: "user", content: "older", timestamp: "2026-01-01T09:00:00Z" },
      { role: "user", content: "untimed" },
      ...session,
    ]);
  },
);

Deno.test(
  "merged history without context is the session; caps keep the note",
  () => {
    const session = [{ role: "user", content: "only" }];
    assertEquals(buildCarmenMergedHistory([], session), session);
    const context = Array.from({ length: 5 }, (_, i) => ({
      role: "user",
      content: `c${i}`,
    }));
    const capped = buildCarmenMergedHistory(context, session, 3);
    assertStrictEquals(capped.length, 3);
    assertEquals(capped.slice(1), [
      { role: "user", content: "c4" },
      ...session,
    ]);
  },
);
