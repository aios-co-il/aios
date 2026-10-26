import assert from "node:assert/strict";
import test from "node:test";
import { requireInsertValue } from "./database-contracts.ts";
import { errorMessage } from "./error-message.ts";
import { isMarketingWorkItemListRow } from "./marketing-rows.ts";
import { isPulseSnapshotRow, isRetentionPulseRow } from "./pulse-rows.ts";
import { isJson } from "./row-guards.ts";
import { jsonObject } from "./json-config.ts";
import { crmRecordDay } from "./tool-contracts-crm.ts";
import {
  automationStepArg,
  isParallelTaskArg,
  nestedErrorMessage,
  readField,
} from "./tool-contracts-admin.ts";
import { isMetaNode, readMetaResponse } from "./meta-response.ts";
import { readImageGenerationPayload } from "./image-generation-payload.ts";
import { readMetaLeadQuestionInput } from "./tool-contracts-marketing.ts";

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
  assert.deepEqual(await readMetaResponse(response(payload)), payload);
});

test("Meta API errors and nullable fields survive decoding for existing fallback handling", async () => {
  const payload = {
    data: null,
    error: { message: "Token expired", code: 190, type: null },
    paging: null,
  };
  assert.deepEqual(await readMetaResponse(response(payload, 400)), payload);
  const nullable = {
    id: null,
    spend: null,
    actions: null,
    cost_per_action_type: null,
    questions: null,
  };
  assert.deepEqual(await readMetaResponse(response(nullable)), nullable);
  assert.deepEqual(await readMetaResponse(response({ data: [] })), {
    data: [],
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
    await assert.rejects(
      readMetaResponse(response(payload)),
      /Invalid Meta response/,
    );
  }
  await assert.rejects(readMetaResponse(new Response("not-json")), SyntaxError);
});

test("configured Meta pages accept nullable optional fields and reject malformed fields", () => {
  assert.equal(
    isMetaNode({ id: "page-1", name: null, access_token: "page-token" }),
    true,
  );
  assert.equal(isMetaNode({ id: "page-1", access_token: {} }), false);
});

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

test("errorMessage reads message from errors and error-like objects", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage({ message: "postgrest" }), "postgrest");
  assert.equal(errorMessage("plain string"), undefined);
  assert.equal(errorMessage(null), undefined);
  assert.equal(errorMessage({ code: 1 }), undefined);
});

test("crmRecordDay keeps string dates and drops non-string ones", () => {
  assert.equal(crmRecordDay({ date: "2026-10-01", spend: 3 }), "2026-10-01");
  for (const data of [
    { date: "" },
    { date: 20261001 },
    { date: null },
    { spend: 3 },
    ["2026-10-01"],
    "2026-10-01",
    null,
  ]) {
    assert.equal(crmRecordDay(data), null);
  }
});

test("image provider payloads expose only the fields generate_ad_image reads", () => {
  assert.deepEqual(
    readImageGenerationPayload({ data: [{ b64_json: "aGk=" }], created: 1 }),
    { content: "", b64Json: "aGk=", inlineParts: [] },
  );
  assert.deepEqual(
    readImageGenerationPayload({
      choices: [
        {
          message: {
            content: "done",
            parts: [
              { text: "no image" },
              { inline_data: null },
              { inline_data: { data: "aGk=", mime_type: "image/jpeg" } },
            ],
          },
        },
      ],
    }),
    {
      content: "done",
      b64Json: "",
      inlineParts: [{ data: "aGk=", mime_type: "image/jpeg" }],
    },
  );
  for (const malformed of [null, "x", [], { data: [{ b64_json: 7 }] }]) {
    assert.deepEqual(readImageGenerationPayload(malformed), {
      content: "",
      b64Json: "",
      inlineParts: [],
    });
  }
});

test("Meta lead form question input reads type and label from objects only", () => {
  assert.deepEqual(
    readMetaLeadQuestionInput({ type: "custom", label: "Budget", x: 1 }),
    { type: "custom", label: "Budget" },
  );
  assert.deepEqual(readMetaLeadQuestionInput({ type: "EMAIL" }), {
    type: "EMAIL",
    label: undefined,
  });
  assert.deepEqual(readMetaLeadQuestionInput("EMAIL"), {});
  assert.deepEqual(readMetaLeadQuestionInput(null), {});
});

test("readField and nestedErrorMessage mirror optional chaining on provider JSON", () => {
  assert.equal(readField({ id: "1" }, "id"), "1");
  for (const value of [null, undefined, "text", 3, [], ["x"]]) {
    assert.equal(readField(value, "id"), undefined);
  }
  assert.equal(nestedErrorMessage({ error: { message: "denied" } }), "denied");
  assert.equal(nestedErrorMessage({ error: "denied" }), undefined);
  assert.equal(nestedErrorMessage({}), undefined);
  assert.equal(nestedErrorMessage(null), undefined);
});

test("delegate_parallel keeps only entries with a truthy title and prompt", () => {
  const tasks: unknown[] = [
    { title: "a", prompt: "b", task_skills: ["x"] },
    { title: "", prompt: "b" },
    { title: "a" },
    null,
    "task",
    ["a", "b"],
  ];
  assert.deepEqual(tasks.filter(isParallelTaskArg), [tasks[0]]);
});

test("automation steps read LLM fields and still reject null entries", () => {
  assert.deepEqual(automationStepArg({ type: "agent", config: { a: 1 } }), {
    type: "agent",
    skin: undefined,
    instruction: undefined,
    action_type: undefined,
    config: { a: 1 },
    label: undefined,
  });
  assert.equal(automationStepArg("step").type, undefined);
  assert.throws(() => automationStepArg(null), TypeError);
  assert.throws(() => automationStepArg(undefined), TypeError);
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

test("dynamic-select rows are validated field by field", () => {
  assert.equal(isPulseSnapshotRow(pulseRow), true);
  assert.equal(isPulseSnapshotRow({ ...pulseRow, status: "pending" }), false);
  assert.equal(isPulseSnapshotRow({ ...pulseRow, flags: [1] }), false);
  assert.equal(isPulseSnapshotRow({ ...pulseRow, clients: {} }), false);
  const retention = { client_id: "c1", status: "x", calculated_at: "d" };
  assert.equal(isRetentionPulseRow({ ...retention, flags: null }), true);
  assert.equal(isRetentionPulseRow(retention), false);
  const item = { ...nulls("title", "target_channel", "client_id"), id: "i1" };
  const listRow = { ...item, status: "draft", payload: { a: [1, null] } };
  const row = { ...listRow, ...nulls("pipeline_id", "current_stage_id") };
  const full = { ...row, updated_at: "2026-10-01", clients: null };
  assert.equal(isMarketingWorkItemListRow(full), true);
  assert.equal(isMarketingWorkItemListRow({ ...full, status: "x" }), false);
  assert.equal(isJson({ a: () => 1 }), false);
});

test("NOT NULL insert values fail before the request only when missing", () => {
  assert.equal(requireInsertValue("", "t.c"), "");
  assert.throws(() => requireInsertValue(null, "t.user_id"), /t.user_id/);
});
