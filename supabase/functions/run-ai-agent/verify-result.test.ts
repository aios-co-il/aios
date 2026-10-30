import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { TableReconcileResult } from "../_shared/reconcile/run-summary.ts";
import { table } from "./verify-fixtures.ts";
import { toVerifyResult } from "./verify-result.ts";

/** A matching Meta result whose platform rows are one sales campaign. */
const okResult = (
  overrides: Partial<TableReconcileResult> = {},
): TableReconcileResult => ({
  status: "ok",
  platform: "meta",
  window_start: "2026-10-19",
  window_end: "2026-10-25",
  findings: [],
  summary: {
    timezone: "Asia/Jerusalem",
    pending_dates: [],
    totals: {
      aios: { spend: 400, revenue: 0 },
      platform: { spend: 400, revenue: 0 },
    },
  },
  platform_rows: [
    {
      campaign_id: "2",
      campaign_name: "מכירות",
      date: "2026-10-20",
      data: { spend: 400, campaign_objective: "OUTCOME_SALES" },
    },
  ],
  ...overrides,
});

describe("toVerifyResult", () => {
  it("keeps the verify answer's shape and still flags the report type", () => {
    const out = toVerifyResult(table, okResult());
    assertEquals(
      {
        client: out.client,
        agency: out.agency,
        period: out.period,
        ok: out.ok,
        meta_spend: out.meta_spend,
        aios_spend: out.aios_spend,
        report_type: out.report_type,
        mismatches: out.mismatches,
      },
      {
        client: "לקוח",
        agency: "סוכנות",
        period: "2026-10-19 – 2026-10-25",
        ok: false,
        meta_spend: 400,
        aios_spend: 400,
        report_type: "leads",
        mismatches: [],
      },
    );
    assertStrictEquals(
      out.type_issue,
      "הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪400)",
    );
  });

  it("reads a failed run as an error line, a missing token in Hebrew", () => {
    const failed = (error: string): TableReconcileResult => ({
      status: "failed",
      platform: "meta",
      window_start: null,
      window_end: null,
      findings: [],
      error_kind: "auth",
      summary: { error },
    });
    assertEquals(
      toVerifyResult(table, failed("no active Meta connection token")),
      {
        client: "לקוח",
        error: "אין טוקן פייסבוק פעיל",
      },
    );
    assertEquals(
      toVerifyResult(table, failed("Meta 400: Session has expired")),
      {
        client: "לקוח",
        error: "מטא: Meta 400: Session has expired",
      },
    );
  });
});
