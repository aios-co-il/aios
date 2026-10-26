import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { TableReconcileResult } from "./reconcile-core.ts";
import type { ListedTable } from "./reconcile-db.ts";
import { memoryDb } from "./reconcile-memory-db.ts";
import {
  legacyMismatches,
  toVerifyResult,
  verifyReportVsMeta,
} from "./reconcile-verify.ts";

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

const tokenDb = () =>
  memoryDb({
    tenant_integrations: [
      {
        id: "conn-1",
        tenant_id: "tenant-1",
        integration_type: "facebook",
        is_active: true,
        connection_visibility: "org",
        api_key: "EAABtokentokentokentokentoken",
        updated_at: "2026-10-20T00:00:00Z",
      },
    ],
  });

Deno.test(
  "yesterday not synced yet: the client is listed as not compared, never as matching",
  async () => {
    // "תבדקי את הדוח של אתמול מול מטא" at 01:30 UTC, before the morning sync.
    const requests: string[] = [];
    const out = await verifyReportVsMeta({
      db: tokenDb(),
      tables: [{ ...table, last_sync_at: "2026-10-26T11:45:00Z" }],
      days: 1,
      now: new Date("2026-10-27T01:30:00Z"),
      fetch: (url) => {
        requests.push(url);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              account_id: "1",
              name: "Ads",
              currency: "ILS",
              timezone_name: "Asia/Jerusalem",
            }),
          ),
        );
      },
    });
    assertEquals(
      {
        checked: out.checked,
        ok_count: out.ok_count,
        ok_clients: out.ok_clients,
        problems: out.problems,
        not_yet_synced: out.not_yet_synced,
      },
      {
        checked: 0,
        ok_count: 0,
        ok_clients: [],
        problems: [],
        not_yet_synced: [{ client: "לקוח", dates: ["2026-10-26"] }],
      },
    );
    // Only the account (for its time zone) was read; nothing to compare.
    assertStrictEquals(requests.length, 1);
  },
);

Deno.test(
  "a Meta rate limit stops the live check instead of trying every table",
  async () => {
    let requests = 0;
    const out = await verifyReportVsMeta({
      db: tokenDb(),
      tables: [table, { ...table, id: "t2", client_name: "לקוח 2" }],
      days: 7,
      now: new Date("2026-10-26T09:00:00Z"),
      concurrency: 1,
      sleep: () => Promise.resolve(),
      fetch: () => {
        requests += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 4, message: "Application request limit reached" },
            }),
            { status: 400 },
          ),
        );
      },
    });
    // One request plus two retries for the first table, none for the second.
    assertStrictEquals(requests, 3);
    assertEquals(out.not_checked, ["לקוח 2"]);
    assertStrictEquals(String(out.note).startsWith("מטא הגבילה"), true);
  },
);
