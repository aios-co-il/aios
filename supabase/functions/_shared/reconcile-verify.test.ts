import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { TableReconcileResult } from "./reconcile-core.ts";
import type { ListedTable } from "./reconcile-db.ts";
import { legacyMismatches, toVerifyResult } from "./reconcile-verify.ts";

const table: ListedTable = {
  id: "t1",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_1", campaign_type: "leads" },
  client_name: "לקוח",
  client_status: "active",
  agency_name: "סוכנות",
};

Deno.test(
  "per-day findings become one verify entry per campaign and metric",
  () => {
    const out = legacyMismatches([
      {
        kind: "missing_day",
        campaign_id: null,
        date: "2026-10-21",
        metric: "spend",
        aios_value: 0,
        platform_value: 300,
        details: {},
      },
      {
        kind: "mismatch",
        campaign_id: "1",
        date: "2026-10-20",
        metric: "spend",
        aios_value: 70,
        platform_value: 100,
        details: { campaign_name: "A" },
      },
      {
        kind: "mismatch",
        campaign_id: "1",
        date: "2026-10-22",
        metric: "spend",
        aios_value: 50,
        platform_value: 80,
        details: { campaign_name: "A" },
      },
      {
        kind: "mismatch",
        campaign_id: "1",
        date: "2026-10-22",
        metric: "leads",
        aios_value: 1,
        platform_value: 4,
        details: { campaign_name: "A" },
      },
      {
        kind: "missing_on_platform",
        campaign_id: "9",
        date: null,
        metric: "spend",
        aios_value: 55,
        platform_value: 0,
        details: { campaign_name: "Z" },
      },
    ]);
    assertEquals(out, [
      { kind: "missing_day", date: "2026-10-21", meta: 300, aios: 0 },
      {
        kind: "missing_in_meta",
        campaign_id: "9",
        campaign_name: "Z",
        meta: 0,
        aios: 55,
      },
      {
        kind: "spend",
        campaign_id: "1",
        campaign_name: "A",
        meta: 180,
        aios: 120,
        dates: ["2026-10-20", "2026-10-22"],
      },
      {
        kind: "results",
        campaign_id: "1",
        campaign_name: "A",
        metric: "leads",
        meta: 4,
        aios: 1,
        dates: ["2026-10-22"],
      },
    ]);
  },
);

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

Deno.test(
  "the verify answer keeps its shape and still flags the report type",
  () => {
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
  },
);

Deno.test(
  "a failed run reads as an error line, a missing token in Hebrew",
  () => {
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
  },
);
