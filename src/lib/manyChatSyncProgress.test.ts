import assert from "node:assert/strict";
import test from "node:test";
import { isSyncJobStatus, parseSyncProgress } from "./manyChatSyncProgress.ts";

test("parseSyncProgress keeps well-formed progress", () => {
  const progress = parseSyncProgress({
    processed: 3,
    failed: 1,
    remaining: 2,
    conflicts: 0,
    total: 6,
    results: [{ leadId: "l1", success: true, leadName: "Dana" }],
  });
  assert.equal(progress.processed, 3);
  assert.equal(progress.total, 6);
  assert.deepEqual(progress.results, [
    {
      leadId: "l1",
      success: true,
      leadName: "Dana",
      error: undefined,
      subscriberId: undefined,
      skipped: undefined,
    },
  ]);
});

test("parseSyncProgress defaults null and malformed input", () => {
  const empty = {
    processed: 0,
    failed: 0,
    remaining: 0,
    conflicts: 0,
    total: 0,
    results: [],
  };
  assert.deepEqual(parseSyncProgress(null), empty);
  assert.deepEqual(parseSyncProgress("x"), empty);
  assert.deepEqual(
    parseSyncProgress({ processed: "5", results: [{ leadId: 1 }, null] }),
    empty,
  );
});

test("isSyncJobStatus accepts only known statuses", () => {
  assert.equal(isSyncJobStatus("running"), true);
  assert.equal(isSyncJobStatus("done"), false);
  assert.equal(isSyncJobStatus(undefined), false);
});
