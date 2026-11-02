import { describe, expect, test } from "vitest";
import {
  approvalEndpoint,
  approvalOutcome,
  approvalRequestBody,
} from "./approvalDecision.ts";

const carmenRow = { id: "a1", run_id: null };
const runRow = { id: "b2", run_id: "r9" };

describe("approvalEndpoint", () => {
  test("Carmen approvals go to carmen-approval-execute, run steps to resume-agent-run", () => {
    expect(approvalEndpoint(carmenRow)).toBe("carmen-approval-execute");
    expect(approvalEndpoint(runRow)).toBe("resume-agent-run");
  });
});

describe("approvalRequestBody", () => {
  test("request bodies never carry a browser-chosen approver", () => {
    expect(approvalRequestBody(carmenRow, "approve")).toStrictEqual({
      approval_id: "a1",
    });
    expect(approvalRequestBody(carmenRow, "reject")).toStrictEqual({
      approval_id: "a1",
      decision: "reject",
    });
    expect(approvalRequestBody(runRow, "approve")).toStrictEqual({
      approval_id: "b2",
      decision: "approved",
    });
    expect(approvalRequestBody(runRow, "reject")).toStrictEqual({
      approval_id: "b2",
      decision: "rejected",
    });
  });
});

describe("approvalOutcome", () => {
  test("the user sees the real execution result", () => {
    expect(approvalOutcome("approve", { success: true })).toStrictEqual({
      ok: true,
      message: "אושר ובוצע",
    });
    expect(
      approvalOutcome("approve", { success: true, already_executed: true })
        .message,
    ).toBe("הבקשה כבר בוצעה קודם");
    const failed = approvalOutcome("approve", {
      success: false,
      result: { error: "Invalid OAuth access token" },
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/Invalid OAuth access token/);
    expect(
      approvalOutcome("approve", { error: "approver_role_required" }).message,
    ).toBe("הפעולה הזו דורשת אישור של בעלים או מנהל/ת סוכנות");
    expect(approvalOutcome("approve", { error: "expired" }).message).toBe(
      "פג תוקף הבקשה",
    );
    expect(approvalOutcome("approve", null).ok).toBe(false);
  });

  test("resume-agent-run results are read from executionResult", () => {
    expect(
      approvalOutcome("approve", { ok: true, executionResult: { ok: true } })
        .ok,
    ).toBe(true);
    const failed = approvalOutcome("approve", {
      ok: true,
      executionResult: { ok: false, error: "handler crashed" },
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/handler crashed/);
  });

  test("reject outcomes", () => {
    expect(
      approvalOutcome("reject", { success: true, rejected: true }),
    ).toStrictEqual({
      ok: true,
      message: "הבקשה נדחתה",
    });
    expect(approvalOutcome("reject", { error: "not_pending" }).message).toBe(
      "הבקשה כבר טופלה",
    );
  });
});
