import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalEndpoint,
  approvalOutcome,
  approvalRequestBody,
} from "./approvalDecision.ts";

const carmenRow = { id: "a1", run_id: null };
const runRow = { id: "b2", run_id: "r9" };

test("Carmen approvals go to carmen-approval-execute, run steps to resume-agent-run", () => {
  assert.equal(approvalEndpoint(carmenRow), "carmen-approval-execute");
  assert.equal(approvalEndpoint(runRow), "resume-agent-run");
});

test("request bodies never carry a browser-chosen approver", () => {
  assert.deepEqual(approvalRequestBody(carmenRow, "approve"), {
    approval_id: "a1",
  });
  assert.deepEqual(approvalRequestBody(carmenRow, "reject"), {
    approval_id: "a1",
    decision: "reject",
  });
  assert.deepEqual(approvalRequestBody(runRow, "approve"), {
    approval_id: "b2",
    decision: "approved",
  });
  assert.deepEqual(approvalRequestBody(runRow, "reject"), {
    approval_id: "b2",
    decision: "rejected",
  });
});

test("the user sees the real execution result", () => {
  assert.deepEqual(approvalOutcome("approve", { success: true }), {
    ok: true,
    message: "אושר ובוצע",
  });
  assert.equal(
    approvalOutcome("approve", { success: true, already_executed: true })
      .message,
    "הבקשה כבר בוצעה קודם",
  );
  const failed = approvalOutcome("approve", {
    success: false,
    result: { error: "Invalid OAuth access token" },
  });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /Invalid OAuth access token/);
  assert.equal(
    approvalOutcome("approve", { error: "approver_role_required" }).message,
    "הפעולה הזו דורשת אישור של בעלים או מנהל/ת סוכנות",
  );
  assert.equal(
    approvalOutcome("approve", { error: "expired" }).message,
    "פג תוקף הבקשה, ולכן היא לא בוצעה",
  );
  assert.equal(approvalOutcome("approve", null).ok, false);
});

test("resume-agent-run results are read from executionResult", () => {
  assert.equal(
    approvalOutcome("approve", { ok: true, executionResult: { ok: true } }).ok,
    true,
  );
  const failed = approvalOutcome("approve", {
    ok: true,
    executionResult: { ok: false, error: "handler crashed" },
  });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /handler crashed/);
});

test("reject outcomes", () => {
  assert.deepEqual(
    approvalOutcome("reject", { success: true, rejected: true }),
    {
      ok: true,
      message: "הבקשה נדחתה",
    },
  );
  assert.equal(
    approvalOutcome("reject", { error: "not_pending" }).message,
    "הבקשה כבר טופלה",
  );
});
