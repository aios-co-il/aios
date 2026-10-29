import { expect, test } from "vitest";
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
  expect(progress.processed).toBe(3);
  expect(progress.total).toBe(6);
  expect(progress.results).toStrictEqual([
    { leadId: "l1", success: true, leadName: "Dana" },
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
  expect(parseSyncProgress(null)).toStrictEqual(empty);
  expect(parseSyncProgress("x")).toStrictEqual(empty);
  expect(
    parseSyncProgress({ processed: "5", results: [{ leadId: 1 }, null] }),
  ).toStrictEqual(empty);
});

test("isSyncJobStatus accepts only known statuses", () => {
  expect(isSyncJobStatus("running")).toBe(true);
  expect(isSyncJobStatus("done")).toBe(false);
  expect(isSyncJobStatus(undefined)).toBe(false);
});

test("parseSyncProgress reads non-finite counts as 0 and mistyped result fields as absent", () => {
  const progress = parseSyncProgress({
    processed: Infinity,
    failed: 2,
    results: [{ leadId: "l2", success: false, error: 7, skipped: "yes" }],
  });
  expect(progress.processed).toBe(0);
  expect(progress.failed).toBe(2);
  expect(progress.results).toEqual([{ leadId: "l2", success: false }]);
});
