import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { memoryDb } from "../_shared/reconcile/memory-db.ts";
import {
  getReconciliationStatus,
  reconciliationStatusTool,
} from "./reconciliation-status.ts";

const SINCE = "2026-10-23T00:00:00Z";

/** A run of table t1 of tenant-1. */
const statusRun = (
  id: string,
  status: string,
  started_at: string,
  summary: Record<string, unknown>,
) => ({
  id,
  tenant_id: "tenant-1",
  client_id: "client-1",
  table_id: "t1",
  platform: "meta",
  status,
  started_at,
  finished_at: started_at,
  window_start: status === "ok" ? "2026-10-18" : null,
  window_end: status === "ok" ? "2026-10-24" : null,
  summary,
  crm_tables: { name: "דוח לידים" },
  clients: { name: "לקוח" },
});

/** Status of tenant-1 as its owner sees it. */
const ownerStatus = (runs: Array<Record<string, unknown>>) =>
  getReconciliationStatus(memoryDb({ reconcile_runs: runs }), {
    tenantId: "tenant-1",
    callerRole: "owner",
    sinceIso: SINCE,
  });

describe("getReconciliationStatus", () => {
  it("keeps the latest run per table and puts gaps first", async () => {
    const run = (
      id: string,
      table_id: string | null,
      status: string,
      started_at: string,
    ) => ({
      id,
      tenant_id: "tenant-1",
      client_id: "client-1",
      table_id,
      platform: "meta",
      status,
      started_at,
      finished_at: started_at,
      window_start: "2026-10-19",
      window_end: "2026-10-24",
      summary:
        status === "mismatch"
          ? {
              counts: { mismatch: 2 },
              findings_total: 2,
              top_findings: [{ kind: "mismatch", campaign: "A" }],
            }
          : {},
      crm_tables: { name: `table ${table_id}` },
      clients: { name: "Client" },
    });
    const status = await ownerStatus([
      run("3", "t1", "ok", "2026-10-26T01:31:00Z"),
      run("2", "t2", "mismatch", "2026-10-26T01:30:30Z"),
      run("1", "t1", "mismatch", "2026-10-25T01:30:00Z"),
    ]);
    assertStrictEquals(status.checked, 2);
    assertStrictEquals(status.ok, 1);
    assertStrictEquals(status.with_gaps, 1);
    assertEquals(
      status.items.map((i) => [i.table_id, i.status]),
      [
        ["t2", "mismatch"],
        ["t1", "ok"],
      ],
    );
    assertEquals(status.items[0].top_findings, [
      { kind: "mismatch", campaign: "A" },
    ]);
  });

  it("lists a table a rate limit kept from being checked as such, with its previous result", async () => {
    const status = await ownerStatus([
      statusRun("3", "skipped", "2026-10-26T02:10:00Z", {
        skipped_reason: "platform_rate_limited",
      }),
      statusRun("2", "failed", "2026-10-26T01:40:00Z", {
        error_kind: "rate_limit",
        error: "Meta 400: too many calls",
      }),
      statusRun("1", "ok", "2026-10-25T01:35:00Z", { findings_total: 0 }),
    ]);
    assertEquals(status.rate_limited_tables, [
      {
        client: "לקוח",
        table: "דוח לידים",
        platform: "meta",
        attempted_at: "2026-10-26T02:10:00Z",
      },
    ]);
    assertStrictEquals(
      String(status.rate_limited_note).includes("הגבילה את קצב הבקשות"),
      true,
    );
    const item = status.items[0];
    assertEquals(
      [item.status, item.error, item.rate_limited],
      ["skipped", "platform_rate_limited", true],
    );
    assertEquals(item.previous, {
      status: "ok",
      checked_at: "2026-10-25T01:35:00Z",
      window: "2026-10-18 – 2026-10-24",
      findings_total: 0,
      top_findings: [],
    });
  });

  it("carries no rate-limit fields without rate-limited tables", async () => {
    const status = await ownerStatus([
      statusRun("1", "ok", "2026-10-26T01:35:00Z", { findings_total: 0 }),
    ]);
    assertStrictEquals("rate_limited_tables" in status, false);
    assertStrictEquals("rate_limited" in status.items[0], false);
  });
});

describe("reconciliationStatusTool", () => {
  it("refuses every client to a caller who is not a manager", async () => {
    await assertRejects(
      () =>
        reconciliationStatusTool(
          {
            supabase: memoryDb({}),
            callerScope: {
              isManagerRole: false,
              isTeamManager: false,
              managedAgencyIds: [],
              accessibleTenantIds: ["tenant-1"],
            },
            isManagerRole: false,
            tenantId: "tenant-1",
            callerRole: "campaigner",
          },
          {},
        ),
      Error,
      "למנהלים בלבד",
    );
  });
});
