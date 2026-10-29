import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { marketingWorkItemListRows } from "./marketing-rows.ts";
import { pulseSnapshotRows, retentionPulseRows } from "./pulse-rows.ts";

const nulls = (...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, null]));

const pulseRow = {
  ...nulls("data_fresh_through", "cpl_change_pct", "roas_7d", "agency_id"),
  ...nulls("roas_change_pct", "last_meta_change_at", "last_meta_change_type"),
  ...nulls("last_meta_change_actor", "last_meta_change_object", "agencies"),
  ...nulls("meta_change_availability", "ecommerce_goal_status"),
  ...{ tenant_id: "t1", calculated_at: "2026-10-01", client_id: "c1" },
  ...{ spend_7d: 10, lead_spend_7d: 10, ecommerce_spend_7d: 0, leads_7d: 2 },
  ...{ cpl_7d: 5, purchases_7d: 0, revenue_7d: 0, is_ecommerce: false },
  ...{ source: "synced_crm", status: "warning", lead_goal_status: "warning" },
  ...{ campaign_goal_mode: "leads", flags: ["cpl_up"] },
  campaign_breakdown: [{ goal: "leads", alert_eligible: true }],
  clients: { name: "Client" },
};

Deno.test("pulse snapshot rows keep valid rows as selected", () => {
  assertEquals(pulseSnapshotRows([pulseRow]), [pulseRow]);
  assertEquals(pulseSnapshotRows([{ ...pulseRow, extra: 1 }]), [
    { ...pulseRow, extra: 1 },
  ]);
  const withoutOptional = { ...pulseRow, campaign_breakdown: undefined };
  assertStrictEquals(pulseSnapshotRows([withoutOptional]).length, 1);
});

Deno.test("pulse snapshot rows with malformed fields are skipped", () => {
  for (const row of [
    { ...pulseRow, status: "pending" },
    { ...pulseRow, flags: [1] },
    { ...pulseRow, clients: {} },
    { ...pulseRow, campaign_breakdown: [{ goal: 3 }] },
    null,
    "row",
  ]) {
    assertEquals(pulseSnapshotRows([row]), []);
  }
});

Deno.test("retention pulse rows need flags present (null allowed)", () => {
  const retention = { client_id: "c1", status: "x", calculated_at: "d" };
  assertEquals(retentionPulseRows([{ ...retention, flags: null }]), [
    { ...retention, flags: null },
  ]);
  assertEquals(retentionPulseRows([retention]), []);
});

Deno.test("marketing work item list rows check status and payload", () => {
  const item = { ...nulls("title", "target_channel", "client_id"), id: "i1" };
  const listRow = { ...item, status: "draft", payload: { a: [1, null] } };
  const row = { ...listRow, ...nulls("pipeline_id", "current_stage_id") };
  const full = { ...row, updated_at: "2026-10-01", clients: null };
  assertEquals(marketingWorkItemListRows([full]), [full]);
  assertEquals(marketingWorkItemListRows([{ ...full, status: "x" }]), []);
  assertEquals(
    marketingWorkItemListRows([{ ...full, clients: { name: 5 } }]),
    [],
  );
});
