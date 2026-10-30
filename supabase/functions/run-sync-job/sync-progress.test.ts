import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { readSyncProgress } from "./sync-progress.ts";

Deno.test("reads stored counters and results", () => {
  const progress = readSyncProgress({
    processed: 4,
    failed: "2",
    total: 10,
    results: [
      { leadId: "l1", leadName: "A", success: true },
      { leadId: "l2", success: false },
    ],
  });
  assertStrictEquals(progress.processed, 4);
  assertStrictEquals(progress.failed, 2);
  assertStrictEquals(progress.conflicts, 0);
  assertStrictEquals(progress.total, 10);
  assertEquals(progress.results, [
    { leadId: "l1", leadName: "A", success: true },
  ]);
});

Deno.test("defaults everything for missing progress", () => {
  assertEquals(readSyncProgress(null), {
    processed: 0,
    failed: 0,
    conflicts: 0,
    total: 0,
    results: [],
  });
});
