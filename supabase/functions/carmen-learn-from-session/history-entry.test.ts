import assert from "node:assert/strict";
import { test } from "node:test";
import { readHistoryEntry } from "./history-entry.ts";

test("readHistoryEntry keeps object entries as-is", () => {
  const entry = { role: "user", content: "hi" };
  assert.equal(readHistoryEntry(entry), entry);
});

test("readHistoryEntry maps non-object entries to an empty entry", () => {
  for (const raw of [null, undefined, "text", 3, true]) {
    assert.deepEqual(readHistoryEntry(raw), {});
  }
});
