import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { jerusalemHour } from "./calendarTimeZone.ts";
import {
  STAFF_ALERT_INTEGRATION_TYPES,
  STAFF_ALERT_NO_PRIMARY_LINE_HE,
  logStaffAlertOutcome,
  sendStaffAlert,
  staffAlertToolResult,
} from "./staff-notify.ts";
import { fakeFetch, fakeSupabase } from "./testing/fake-supabase.mjs";

const TENANT = "11111111-1111-4111-8111-111111111111";
const REQUESTER = "33333333-3333-4333-8333-333333333333";
const LINE_USER = "44444444-4444-4444-8444-444444444444";
const OWNER = "55555555-5555-4555-8555-555555555555";

const line = (id, extra = {}) => ({
  id,
  tenant_id: TENANT,
  integration_type: "manus_wa",
  is_active: true,
  user_id: null,
  created_at: "2026-01-01",
  ...extra,
});
const greenLine = line("green-1", { integration_type: "green_api" });

function send({
  integrations,
  responses,
  requesterUserId = REQUESTER,
  roles = [],
}) {
  const sb = fakeSupabase({
    tenant_integrations: integrations,
    user_roles: roles,
  });
  const fetch = fakeFetch(responses);
  const run = sendStaffAlert({
    supabase: sb,
    supabaseUrl: "https://this-project.supabase.co",
    serviceRoleKey: "service-key",
    tenantId: TENANT,
    phone: "050-123-4567",
    message: "תזכורת",
    requesterUserId,
    fetchImpl: fetch.impl,
  });
  return { run, sb, fetch };
}

test("staff alert sends only through send-manus-wa-message on a Manus line", async () => {
  const { run, sb, fetch } = send({
    integrations: [greenLine, line("manus-1")],
  });
  const result = await run;
  assert.equal(result.sent, true);
  assert.equal(result.status, "sent");
  assert.equal(result.transport, "manus_wa");
  assert.equal(result.integrationId, "manus-1");
  assert.equal(fetch.calls.length, 1);
  assert.match(fetch.calls[0].url, /\/functions\/v1\/send-manus-wa-message$/);
  assert.deepEqual(fetch.calls[0].body, {
    tenantId: TENANT,
    integrationId: "manus-1",
    senderUserId: REQUESTER,
    phoneNumber: "972501234567",
    message: "תזכורת",
  });
  // Never a client thread or group, so the alert never lands on a client card.
  assert.equal("clientId" in fetch.calls[0].body, false);
  assert.equal("groupId" in fetch.calls[0].body, false);

  const lineQuery = sb.queries.find((q) => q.table === "tenant_integrations");
  const typeFilter = lineQuery.filters.find(
    ([op, col]) => op === "in" && col === "integration_type",
  );
  // send-manus-wa-message only accepts manus_wa rows, so no alias.
  assert.deepEqual(typeFilter[2], ["manus_wa"]);
  assert.deepEqual(STAFF_ALERT_INTEGRATION_TYPES, ["manus_wa"]);
  assert.match(lineQuery.columns, /\bsettings\b/);
});

test("staff alert skips a newer secondary Manus line and sends from Carmen's line", async () => {
  for (const role of ["secondary", "none"]) {
    const { run, fetch } = send({
      integrations: [
        line("manus-carmen", { created_at: "2026-01-01" }),
        line("manus-owner", {
          created_at: "2026-06-01",
          settings: { carmen_role: role },
        }),
      ],
    });
    const result = await run;
    assert.equal(result.status, "sent", role);
    assert.equal(result.integrationId, "manus-carmen", role);
    assert.equal(fetch.calls.length, 1, role);
    assert.equal(fetch.calls[0].body.integrationId, "manus-carmen", role);
  }
});

test("only a secondary Manus line → no_line and nothing is sent", async () => {
  const { run, fetch } = send({
    integrations: [
      line("manus-owner", { settings: { carmen_role: "secondary" } }),
    ],
  });
  const result = await run;
  assert.equal(result.status, "no_line");
  assert.equal(result.sent, false);
  assert.equal(result.error, STAFF_ALERT_NO_PRIMARY_LINE_HE);
  assert.equal(fetch.calls.length, 0);
});

test("a tenant with only a Green API line gets no_line and nothing is sent", async () => {
  const { run, fetch } = send({ integrations: [greenLine] });
  const result = await run;
  assert.equal(result.status, "no_line");
  assert.equal(result.sent, false);
  assert.equal(fetch.calls.length, 0);
  assert.match(staffAlertToolResult(result).error, /Manus/);
});

test("delivery_unknown is never retried on another line; a hard failure is", async () => {
  const unknown = send({
    integrations: [
      line("manus-1", { created_at: "2026-02-01" }),
      line("manus-2"),
    ],
    responses: [
      { status: 202, body: { success: false, delivered: "unknown" } },
    ],
  });
  const r1 = await unknown.run;
  assert.equal(r1.status, "delivery_unknown");
  assert.equal(unknown.fetch.calls.length, 1);
  assert.equal(staffAlertToolResult(r1).success, true);
  assert.match(staffAlertToolResult(r1).warning, /אל תשלחי/);

  const failed = send({
    integrations: [
      line("manus-1", { created_at: "2026-02-01" }),
      line("manus-2"),
    ],
    responses: [
      { status: 400, body: { error: "Manus WhatsApp not configured" } },
      { status: 200, body: { success: true, messageId: "m2" } },
    ],
  });
  const r2 = await failed.run;
  assert.equal(failed.fetch.calls.length, 2);
  assert.equal(r2.status, "sent");
  assert.equal(r2.integrationId, "manus-2");
  assert.equal(r2.providerMessageId, "m2");
});

test("Staging guard blocks are reported, not hidden", async () => {
  const { run } = send({
    integrations: [line("manus-1")],
    responses: [
      {
        status: 403,
        body: {
          error: "blocked_by_staging_safe_mode",
          reason: "empty_allowlist",
        },
      },
    ],
  });
  const result = await run;
  assert.equal(result.status, "blocked_staging");
  assert.match(staffAlertToolResult(result).error, /Staging/);
});

test("sender falls back from a 'system' requester to the line user, then the tenant owner", async () => {
  const viaLine = send({
    integrations: [line("manus-1", { user_id: LINE_USER })],
    requesterUserId: "system",
  });
  await viaLine.run;
  assert.equal(viaLine.fetch.calls[0].body.senderUserId, LINE_USER);

  const viaOwner = send({
    integrations: [line("manus-1")],
    requesterUserId: null,
    roles: [{ tenant_id: TENANT, role: "owner", user_id: OWNER }],
  });
  await viaOwner.run;
  assert.equal(viaOwner.fetch.calls[0].body.senderUserId, OWNER);
});

test("the outcome is written to agent_action_log", async () => {
  const sb = fakeSupabase({});
  await logStaffAlertOutcome(sb, {
    tenantId: TENANT,
    userId: "system",
    recipient: { entity_type: "campaigner", id: "c1", full_name: "אנה" },
    result: {
      sent: false,
      status: "delivery_unknown",
      transport: "manus_wa",
      integrationId: "manus-1",
      providerMessageId: null,
      error: "delivery_unknown",
      phone: "972501234567",
    },
  });
  const [row] = sb.inserts.find((i) => i.table === "agent_action_log").rows;
  assert.equal(row.action_type, "staff_whatsapp_alert");
  assert.equal(row.status, "delivery_unknown");
  assert.equal(row.user_id, null);
  assert.equal(row.action_details.recipient_name, "אנה");
  assert.equal(row.action_details.delivery_status, "delivery_unknown");
});

// ── No staff-alert path reaches send-green-api-message ───────────────────────

test("send_whatsapp_to_staff delegates to the Manus-only notifier", async () => {
  const agent = await readFile(
    new URL("../run-ai-agent/index.ts", import.meta.url),
    "utf8",
  );
  const start = agent.indexOf("async function sendStaffWhatsappMessage(");
  const end = agent.indexOf("const corsHeaders", start);
  assert.ok(start > 0 && end > start);
  const fn = agent.slice(start, end);
  assert.match(fn, /sendStaffAlert\(/);
  assert.doesNotMatch(
    fn,
    /send-green-api-message|green_?api|manage-manus-wa|functions\/v1/i,
  );

  const notifier = await readFile(
    new URL("./staff-notify.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(notifier, /send-green-api-message|green_?api|greenapi/i);
  assert.match(notifier, /send-manus-wa-message/);
});

test("agent-heartbeat sends no WhatsApp and uses the Israel hour", async () => {
  const heartbeat = await readFile(
    new URL("../agent-heartbeat/index.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    heartbeat,
    /send-green-api-message|send-manus-wa-message/,
  );
  assert.doesNotMatch(heartbeat, /daily_digest_sent/);
  assert.doesNotMatch(heartbeat, /getUTCHours\(\)\s*\+\s*3/);
  assert.match(heartbeat, /jerusalemHour\(now\)/);
  // Overdue cutoff and summary date are Israel dates, not UTC ones.
  assert.doesNotMatch(heartbeat, /toISOString\(\)\.split\("T"\)/);
  assert.match(heartbeat, /\.lt\("due_date", jerusalemYmd\(now\)\)/);
  // task_updates has no tenant_id and user_id is a profiles uuid.
  assert.doesNotMatch(heartbeat, /user_id:\s*"system"/);
});

test("jerusalemHour follows DST where getUTCHours()+3 does not", () => {
  // Summer (IDT, UTC+3) and winter (IST, UTC+2) around 2026-10-25.
  assert.equal(jerusalemHour(new Date("2026-10-24T04:30:00Z")), 7);
  assert.equal(jerusalemHour(new Date("2026-10-26T04:30:00Z")), 6);
  assert.equal(new Date("2026-10-26T04:30:00Z").getUTCHours() + 3, 7);
  // Midnight wraps to 0, never 24.
  assert.equal(jerusalemHour(new Date("2026-07-01T21:30:00Z")), 0);
  assert.equal(jerusalemHour(new Date("2026-12-31T22:15:00Z")), 0);
});
