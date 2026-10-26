import assert from "node:assert/strict";
import test from "node:test";
import { readSyncProgress } from "./sync-progress.ts";

test("reads stored counters and results", () => {
  const progress = readSyncProgress({
    processed: 4,
    failed: "2",
    total: 10,
    results: [
      { leadId: "l1", leadName: "A", success: true },
      { leadId: "l2", success: false },
    ],
  });
  assert.equal(progress.processed, 4);
  assert.equal(progress.failed, 2);
  assert.equal(progress.conflicts, 0);
  assert.equal(progress.total, 10);
  assert.deepEqual(progress.results, [
    { leadId: "l1", leadName: "A", success: true },
  ]);
});

test("defaults everything for missing progress", () => {
  assert.deepEqual(readSyncProgress(null), {
    processed: 0,
    failed: 0,
    conflicts: 0,
    total: 0,
    results: [],
  });
});
