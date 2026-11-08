import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  requireInsertValue,
  requireUpdateEntityScope,
} from "./database-contracts.ts";
import { marketingWorkItemListRows } from "./marketing-rows.ts";
import { pulseSnapshotRows, retentionPulseRows } from "./pulse-rows.ts";
import { isJson } from "./row-guards.ts";
import { jsonObject } from "./json-config.ts";
import { automationStepArg } from "./tool-contracts-admin.ts";
import { crmRecordDay } from "./tool-contracts-crm.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { isMetaNode, readMetaResponse } from "./meta-response.ts";

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test("Meta responses preserve numeric strings, actions, pagination and extra metrics", async () => {
  const payload = {
    data: [
      {
        campaign_id: "campaign-1",
        spend: "21.5",
        impressions: 100,
        actions: [{ action_type: "lead", value: "3" }],
        purchase_roas: [{ value: "2.5" }],
      },
    ],
    paging: { next: "https://graph.facebook.com/next" },
    summary: { total_count: 1 },
  };
  assert.deepEqual(await readMetaResponse(response(payload)), {
    ok: true,
    value: payload,
  });
});

test("Meta API errors and nullable fields survive decoding for existing fallback handling", async () => {
  const payload = {
    data: null,
    error: { message: "Token expired", code: 190, type: null },
    paging: null,
  };
  assert.deepEqual(await readMetaResponse(response(payload, 400)), {
    ok: true,
    value: payload,
  });
  const nullable = {
    id: null,
    spend: null,
    actions: null,
    cost_per_action_type: null,
    questions: null,
  };
  assert.deepEqual(await readMetaResponse(response(nullable)), {
    ok: true,
    value: nullable,
  });
  assert.deepEqual(await readMetaResponse(response({ data: [] })), {
    ok: true,
    value: { data: [] },
  });
});

test("malformed Graph envelopes cannot masquerade as typed campaign data", async () => {
  for (const payload of [
    null,
    [],
    "bad",
    { data: {} },
    { data: [null] },
    { data: [{ spend: {} }] },
    { actions: [{ value: {} }] },
    { questions: [{ label: 42 }] },
    { paging: { next: 3 } },
    { error: "expired" },
  ]) {
    assert.deepEqual(await readMetaResponse(response(payload)), {
      ok: false,
      error: { message: "Invalid Meta response" },
    });
  }
  await assert.rejects(readMetaResponse(new Response("not-json")), SyntaxError);
});

test("invalid Graph bodies return Meta's own error when it sent one", async () => {
  const error = { message: "Token expired", code: "190" };
  assert.deepEqual(await readMetaResponse(response({ error }, 400)), {
    ok: false,
    error,
  });
});

test("configured Meta pages accept nullable optional fields and reject malformed fields", () => {
  assert.equal(
    isMetaNode({ id: "page-1", name: null, access_token: "page-token" }),
    true,
  );
  assert.equal(isMetaNode({ id: "page-1", access_token: {} }), false);
});

Deno.test(
  "automation steps read LLM fields and still reject null entries",
  () => {
    assertEquals(
      automationStepArg({
        type: "agent",
        config: { message_template: "hello" },
      }),
      {
        type: "agent",
        config: { message_template: "hello" },
      },
    );
    assertThrows(() => automationStepArg("step"));
    assertThrows(() => automationStepArg(null), TypeError);
    assertThrows(() => automationStepArg(undefined), TypeError);
  },
);

Deno.test("crmRecordDay keeps string dates and drops non-string ones", () => {
  assertStrictEquals(
    crmRecordDay({ date: "2026-10-01", spend: 3 }),
    "2026-10-01",
  );
  for (const data of [
    { date: "" },
    { date: 20261001 },
    { date: null },
    { spend: 3 },
    ["2026-10-01"],
    "2026-10-01",
    null,
  ]) {
    assertStrictEquals(crmRecordDay(data), null);
  }
});

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

Deno.test("dynamic-select rows are validated field by field", () => {
  assertStrictEquals(isPulseSnapshotRow(pulseRow), true);
  assertStrictEquals(
    isPulseSnapshotRow({ ...pulseRow, status: "pending" }),
    false,
  );
  assertStrictEquals(isPulseSnapshotRow({ ...pulseRow, flags: [1] }), false);
  assertStrictEquals(isPulseSnapshotRow({ ...pulseRow, clients: {} }), false);
  const retention = { client_id: "c1", status: "x", calculated_at: "d" };
  assertStrictEquals(isRetentionPulseRow({ ...retention, flags: null }), true);
  assertStrictEquals(isRetentionPulseRow(retention), false);
  const item = { ...nulls("title", "target_channel", "client_id"), id: "i1" };
  const listRow = { ...item, status: "draft", payload: { a: [1, null] } };
  const row = { ...listRow, ...nulls("pipeline_id", "current_stage_id") };
  const full = { ...row, updated_at: "2026-10-01", clients: null };
  assertStrictEquals(isMarketingWorkItemListRow(full), true);
  assertStrictEquals(
    isMarketingWorkItemListRow({ ...full, status: "x" }),
    false,
  );
  assertStrictEquals(isJson({ a: () => 1 }), false);
});

Deno.test(
  "NOT NULL insert values fail before the request only when missing",
  () => {
    assertStrictEquals(requireInsertValue("", "t.c"), "");
    assertThrows(
      () => requireInsertValue(null, "t.user_id"),
      Error,
      "t.user_id",
    );
  },
);
test("persisted configuration keeps nested mappings intact while primitives have no keys", () => {
  const settings = {
    form_mappings: {
      form1: { agency_id: "agency-1", fields: { email: "EMAIL" } },
    },
    other: true,
  };
  assert.equal(jsonObject(settings), settings);
  for (const value of [null, undefined, true, 42, "legacy", []]) {
    assert.deepEqual(jsonObject(value), {});
  }
});

const isMarketingWorkItemListRow = (value: unknown) =>
  marketingWorkItemListRows([value]).length > 0;
const isPulseSnapshotRow = (value: unknown) =>
  pulseSnapshotRows([value]).length > 0;
const isRetentionPulseRow = (value: unknown) =>
  retentionPulseRows([value]).length > 0;

Deno.test(
  "updates refuse an inaccessible parent or a failed scope lookup",
  async () => {
    const db = (data: { id: string } | null, error: Error | null = null) =>
      createClient<Database>("https://example.supabase.co", "key", {
        auth: { persistSession: false },
        global: {
          fetch: async () =>
            new Response(
              JSON.stringify(
                error ? { message: error.message, code: "42501" } : data,
              ),
              {
                status: error ? 403 : 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
        },
      });
    await requireUpdateEntityScope(db({ id: "task-a" }), "tasks", "task-a", [
      "tenant-a",
    ]);
    await assertRejects(
      () => requireUpdateEntityScope(db(null), "tasks", "task-b", ["tenant-a"]),
      Error,
      "outside the accessible tenants",
    );
    await assert.rejects(
      () =>
        requireUpdateEntityScope(
          db(null, new Error("read failed")),
          "leads",
          "lead-a",
          ["tenant-a"],
        ),
      { message: "read failed" },
    );
  },
);
