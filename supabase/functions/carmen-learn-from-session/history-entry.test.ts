import { assertEquals } from "jsr:@std/assert@1";
import { readHistoryEntry } from "./history-entry.ts";

Deno.test("readHistoryEntry keeps the entry fields of object entries", () => {
  const entry = { role: "user", content: "hi", text: 3 };
  assertEquals(readHistoryEntry(entry), entry);
  assertEquals(readHistoryEntry({ direction: "in", extra: 1 }), {
    direction: "in",
  });
});

Deno.test("readHistoryEntry maps non-object entries to an empty entry", () => {
  for (const raw of [null, undefined, "text", 3, true, ["user"]]) {
    assertEquals(readHistoryEntry(raw), {});
  }
});
