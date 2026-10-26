import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  authorizeNotifyRequest,
  createClaudeNotifyHandler,
} from "./claude-notify-core.ts";
import { selectNotifyTransport } from "./claude-notify-transport.ts";
import { fakeFetch, fakeSupabase } from "./testing/fake-supabase.mjs";

const TENANT = "11111111-1111-4111-8111-111111111111";
const DAVID_USER = "22222222-2222-4222-8222-222222222222";
const SERVICE_KEY = "service-role-key-of-this-project";
const BEARER = "claude-mcp-bearer";
const PHONE = "972501234567";

// ── Auth matrix ──────────────────────────────────────────────────────────────

test("auth: no bearer with CLAUDE_MCP_BEARER unset is refused (fails closed)", () => {
  assert.deepEqual(
    authorizeNotifyRequest({
      authorization: null,
      serviceRoleKey: SERVICE_KEY,
    }),
    { ok: false },
  );
  assert.deepEqual(
    authorizeNotifyRequest({
      authorization: "Bearer anything",
      bearerSecret: "",
      serviceRoleKey: SERVICE_KEY,
    }),
    { ok: false },
  );
});

test("auth: CLAUDE_MCP_BEARER and this project's service-role key are both accepted", () => {
  assert.deepEqual(
    authorizeNotifyRequest({
      authorization: `Bearer ${BEARER}`,
      bearerSecret: BEARER,
      serviceRoleKey: SERVICE_KEY,
    }),
    { ok: true, via: "bearer" },
  );
  for (const bearerSecret of [BEARER, null, ""]) {
    assert.deepEqual(
      authorizeNotifyRequest({
        authorization: `Bearer ${SERVICE_KEY}`,
        bearerSecret,
        serviceRoleKey: SERVICE_KEY,
      }),
      { ok: true, via: "service_role" },
    );
  }
});

test("auth: a wrong token or an empty service key never matches", () => {
  assert.equal(
    authorizeNotifyRequest({
      authorization: "Bearer other",
      bearerSecret: BEARER,
      serviceRoleKey: SERVICE_KEY,
    }).ok,
    false,
  );
  assert.equal(
    authorizeNotifyRequest({
      authorization: "Bearer ",
      bearerSecret: "",
      serviceRoleKey: "",
    }).ok,
    false,
  );
});

// ── Transport selection ──────────────────────────────────────────────────────

const greenStep = (automation_id, created_at = "2026-01-01") => ({
  automation_id,
  action_type: "send_green_api_message",
  configuration: { green_api_integration_id: "green-1" },
  created_at,
});
const manusStep = (
  automation_id,
  integration_id,
  created_at = "2026-02-01",
) => ({
  automation_id,
  action_type: "send_manus_message",
  configuration: integration_id ? { integration_id } : {},
  created_at,
});
const manusLine = (id, is_active = true, user_id = null) => ({
  id,
  tenant_id: TENANT,
  user_id,
  integration_type: "manus_wa",
  is_active,
  created_at: "2026-01-01",
});

test("transport: Manus step wins even when the bridge automation's first step is Green", () => {
  const plan = selectNotifyTransport({
    tenantId: TENANT,
    bridgeAutomationId: "auto-1",
    activeAutomationIds: ["auto-1"],
    steps: [greenStep("auto-1"), manusStep("auto-1", "manus-1")],
    integrations: [manusLine("manus-1")],
  });
  assert.equal(plan.transport, "manus");
  assert.equal(plan.functionName, "send-manus-wa-message");
  assert.equal(plan.integrationId, "manus-1");
  assert.equal(plan.manusIntegrationActive, true);
});

test("transport: another active Carmen automation's Manus step beats a Green bridge", () => {
  const plan = selectNotifyTransport({
    tenantId: TENANT,
    bridgeAutomationId: "auto-green",
    activeAutomationIds: ["auto-green", "auto-manus"],
    steps: [greenStep("auto-green"), manusStep("auto-manus", null)],
    integrations: [manusLine("manus-1")],
  });
  assert.equal(plan.transport, "manus");
  assert.equal(plan.automationId, "auto-manus");
  // No explicit integration on the step → the tenant's active Manus line.
  assert.equal(plan.integrationId, "manus-1");
});

test("transport: Green is only a labelled fallback when no active Manus step exists", () => {
  const inactive = selectNotifyTransport({
    tenantId: TENANT,
    bridgeAutomationId: "auto-1",
    activeAutomationIds: ["auto-1"],
    steps: [manusStep("auto-1", "manus-1"), greenStep("auto-1")],
    integrations: [manusLine("manus-1", false)],
  });
  assert.equal(inactive.transport, "green_fallback");
  assert.equal(inactive.functionName, "send-green-api-message");
  assert.equal(inactive.manusIntegrationActive, false);
  assert.equal(inactive.reason, "manus_integration_inactive");

  const noManus = selectNotifyTransport({
    tenantId: TENANT,
    bridgeAutomationId: "auto-1",
    activeAutomationIds: ["auto-1"],
    steps: [greenStep("auto-1")],
    integrations: [],
  });
  assert.equal(noManus.transport, "green_fallback");
  assert.equal(noManus.reason, "no_carmen_manus_step");
});

test("transport: an inactive non-bridge automation's Manus step is ignored", () => {
  const plan = selectNotifyTransport({
    tenantId: TENANT,
    bridgeAutomationId: null,
    activeAutomationIds: [],
    steps: [manusStep("auto-off", "manus-1")],
    integrations: [manusLine("manus-1")],
  });
  assert.equal(plan.transport, "none");
  assert.equal(plan.functionName, null);
});

// ── Handler ──────────────────────────────────────────────────────────────────

function tenantTables({ steps, integrations, sessions } = {}) {
  return {
    tenant_heartbeat_settings: [
      {
        tenant_id: TENANT,
        campaign_pulse_phone: PHONE,
        campaign_pulse_enabled: true,
      },
    ],
    carmen_whatsapp_sessions: sessions ?? [
      {
        tenant_id: TENANT,
        chat_id: `${PHONE}@c.us`,
        phone: PHONE,
        sender_name: "David",
        connection_user_id: DAVID_USER,
        automation_id: "auto-1",
        last_message_at: "2026-10-25T08:00:00Z",
      },
    ],
    campaigners: [],
    automation_flow_steps: [
      {
        tenant_id: TENANT,
        automation_id: "auto-1",
        step_type: "trigger",
        action_type: "carmen_whatsapp_session",
      },
      ...(steps ?? [manusStep("auto-1", "manus-1")]).map((s) => ({
        ...s,
        step_type: "action",
      })),
    ],
    automations: [{ id: "auto-1", active: true }],
    tenant_integrations: integrations ?? [manusLine("manus-1")],
  };
}

function handler({
  tables = tenantTables(),
  responses,
  bearerSecret = null,
} = {}) {
  const fetch = fakeFetch(responses);
  const warnings = [];
  const handle = createClaudeNotifyHandler({
    supabaseUrl: "https://this-project.supabase.co",
    serviceRoleKey: SERVICE_KEY,
    bearerSecret,
    createSupabase: () => fakeSupabase(tables),
    fetchImpl: fetch.impl,
    logger: { warn: (...a) => warnings.push(a), error: () => {} },
  });
  return { handle, fetch, warnings };
}

function post(body, token) {
  return new Request("https://x/functions/v1/claude-notify", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

const notifyBody = { tenant_id: TENANT, message: "שלום" };

test("handler: unauthenticated requests get 401 and nothing is sent", async () => {
  const { handle, fetch } = handler();
  assert.equal((await handle(post(notifyBody))).status, 401);
  assert.equal((await handle(post(notifyBody, "guess"))).status, 401);
  assert.equal(fetch.calls.length, 0);
});

test("handler: bearer and service-role callers send through Carmen's Manus line", async () => {
  for (const [token, bearerSecret] of [
    [BEARER, BEARER],
    [SERVICE_KEY, null],
  ]) {
    const { handle, fetch, warnings } = handler({ bearerSecret });
    const res = await handle(post(notifyBody, token));
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.sent, true);
    assert.equal(out.status, "sent");
    assert.equal(out.transport, "manus");
    assert.equal(out.error, null);
    assert.equal(fetch.calls.length, 1);
    assert.match(fetch.calls[0].url, /\/functions\/v1\/send-manus-wa-message$/);
    assert.deepEqual(fetch.calls[0].body, {
      tenantId: TENANT,
      senderUserId: DAVID_USER,
      phoneNumber: PHONE,
      message: "שלום",
      integrationId: "manus-1",
    });
    assert.equal(warnings.length, 0);
  }
});

test("handler: a Green send is reported as green_fallback with a warning", async () => {
  const { handle, fetch, warnings } = handler({
    tables: tenantTables({ steps: [greenStep("auto-1")], integrations: [] }),
  });
  const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
  assert.equal(out.transport, "green_fallback");
  assert.equal(out.sent, true);
  assert.match(fetch.calls[0].url, /send-green-api-message$/);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /green_fallback/);
});

test("handler: returns the real send result instead of ok", async () => {
  const cases = [
    [{ status: 500, body: { error: "Manus WA error [500]" } }, "failed"],
    [
      { status: 202, body: { success: false, delivered: "unknown" } },
      "delivery_unknown",
    ],
    [
      {
        status: 403,
        body: {
          error: "blocked_by_staging_safe_mode",
          reason: "empty_allowlist",
        },
      },
      "blocked_staging",
    ],
  ];
  for (const [response, status] of cases) {
    const { handle } = handler({ responses: [response] });
    const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
    assert.equal(out.sent, false, status);
    assert.equal(out.ok, false, status);
    assert.equal(out.status, status);
    assert.ok(out.error, status);
  }
});

test("handler: ping reports the step per tenant and sends nothing", async () => {
  const { handle, fetch } = handler({
    tables: tenantTables({
      steps: [greenStep("auto-1"), manusStep("auto-1", "manus-1")],
      integrations: [manusLine("manus-1", false)],
    }),
  });
  const res = await handle(post({ ping: true }, SERVICE_KEY));
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.ping, true);
  assert.equal(out.sent, false);
  assert.deepEqual(out.tenants, [
    {
      tenant_id: TENANT,
      transport: "green_fallback",
      step_type: "send_green_api_message",
      automation_id: "auto-1",
      integration_id: "green-1",
      manus_integration_active: false,
      active_manus_integrations: 0,
      recipient_source: "campaign_pulse_phone",
      sender_resolved: true,
      reason: "manus_integration_inactive",
    },
  ]);
  assert.equal(fetch.calls.length, 0);
  assert.equal((await handle(post({ ping: true }))).status, 401);
});

test("claude-notify edge function only wires env into the shared handler", async () => {
  const source = await readFile(
    new URL("../claude-notify/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /createClaudeNotifyHandler/);
  assert.match(source, /CLAUDE_MCP_BEARER/);
  assert.doesNotMatch(source, /functions\/v1\//);
});
