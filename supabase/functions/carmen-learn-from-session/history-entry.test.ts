import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { readHistoryEntry } from "./history-entry.ts";

Deno.test("readHistoryEntry keeps object entries as-is", () => {
  const entry = { role: "user", content: "hi" };
  assertStrictEquals(readHistoryEntry(entry), entry);
});

Deno.test("readHistoryEntry maps non-object entries to an empty entry", () => {
  for (const raw of [null, undefined, "text", 3, true]) {
    assertEquals(readHistoryEntry(raw), {});
  }
});
