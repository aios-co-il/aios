import assert from "node:assert/strict";
import test from "node:test";
import {
  isDuplicateClaimError,
  summarizeExecution,
} from "./automation-execution.ts";

test("all automations succeeded → completed", () => {
  const summary = summarizeExecution([
    { status: "fulfilled", value: { success: true, automation_id: "a" } },
    { status: "fulfilled", value: { success: true, automation_id: "b" } },
  ]);
  assert.deepEqual(summary, {
    status: "completed",
    actions_count: 2,
    error: null,
  });
});

test("skipped automation (conditions not met) is not a failure", () => {
  const summary = summarizeExecution([
    { status: "fulfilled", value: { success: false, skipped: true } },
  ]);
  assert.equal(summary.status, "completed");
  assert.equal(summary.error, null);
});

test("a failing automation marks the run failed with its error", () => {
  const summary = summarizeExecution([
    { status: "fulfilled", value: { success: true } },
    {
      status: "fulfilled",
      value: { success: false, automation_id: "b", error: "send failed" },
    },
  ]);
  assert.equal(summary.status, "failed");
  assert.equal(summary.error, "send failed");
  assert.equal(summary.actions_count, 2);
});

test("success:false without an error message is still a failure", () => {
  const summary = summarizeExecution([
    { status: "fulfilled", value: { success: false, automation_id: "c" } },
    { status: "fulfilled", value: undefined }, // conditions not met
  ]);
  assert.equal(summary.status, "failed");
  assert.equal(summary.error, "automation reported failure");
});

test("a thrown automation marks the run failed", () => {
  const summary = summarizeExecution([
    { status: "rejected", reason: new Error("boom") },
  ]);
  assert.equal(summary.status, "failed");
  assert.equal(summary.error, "boom");
});

test("no matching automations → completed with zero actions", () => {
  assert.deepEqual(summarizeExecution([]), {
    status: "completed",
    actions_count: 0,
    error: null,
  });
});

test("only unique_violation counts as a duplicate claim", () => {
  assert.equal(isDuplicateClaimError({ code: "23505" }), true);
  assert.equal(isDuplicateClaimError({ code: "42P01" }), false);
  assert.equal(isDuplicateClaimError(null), false);
  assert.equal(isDuplicateClaimError(undefined), false);
});
