import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";

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

Deno.test(
  "staff alert sends only through send-manus-wa-message on a Manus line",
  async () => {
    const { run, sb, fetch } = send({
      integrations: [greenLine, line("manus-1")],
    });
    const result = await run;
    assertStrictEquals(result.sent, true);
    assertStrictEquals(result.status, "sent");
    assertStrictEquals(result.transport, "manus_wa");
    assertStrictEquals(result.integrationId, "manus-1");
    assertStrictEquals(fetch.calls.length, 1);
    assertMatch(fetch.calls[0].url, /\/functions\/v1\/send-manus-wa-message$/);
    assertEquals(fetch.calls[0].body, {
      tenantId: TENANT,
      integrationId: "manus-1",
      senderUserId: REQUESTER,
      phoneNumber: "972501234567",
      message: "תזכורת",
    });
    // Never a client thread or group, so the alert never lands on a client card.
    assertStrictEquals("clientId" in fetch.calls[0].body, false);
    assertStrictEquals("groupId" in fetch.calls[0].body, false);

    const lineQuery = sb.queries.find((q) => q.table === "tenant_integrations");
    const typeFilter = lineQuery.filters.find(
      ([op, col]) => op === "in" && col === "integration_type",
    );
    // send-manus-wa-message only accepts manus_wa rows, so no alias.
    assertEquals(typeFilter[2], ["manus_wa"]);
    assertEquals(STAFF_ALERT_INTEGRATION_TYPES, ["manus_wa"]);
    assertMatch(lineQuery.columns, /\bsettings\b/);
  },
);

Deno.test(
  "staff alert skips a newer secondary Manus line and sends from Carmen's line",
  async () => {
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
      assertStrictEquals(result.status, "sent", role);
      assertStrictEquals(result.integrationId, "manus-carmen", role);
      assertStrictEquals(fetch.calls.length, 1, role);
      assertStrictEquals(
        fetch.calls[0].body.integrationId,
        "manus-carmen",
        role,
      );
    }
  },
);

Deno.test(
  "only a secondary Manus line → no_line and nothing is sent",
  async () => {
    const { run, fetch } = send({
      integrations: [
        line("manus-owner", { settings: { carmen_role: "secondary" } }),
      ],
    });
    const result = await run;
    assertStrictEquals(result.status, "no_line");
    assertStrictEquals(result.sent, false);
    assertStrictEquals(result.error, STAFF_ALERT_NO_PRIMARY_LINE_HE);
    assertStrictEquals(fetch.calls.length, 0);
  },
);

Deno.test(
  "a tenant with only a Green API line gets no_line and nothing is sent",
  async () => {
    const { run, fetch } = send({ integrations: [greenLine] });
    const result = await run;
    assertStrictEquals(result.status, "no_line");
    assertStrictEquals(result.sent, false);
    assertStrictEquals(fetch.calls.length, 0);
    assertMatch(staffAlertToolResult(result).error, /Manus/);
  },
);

Deno.test(
  "delivery_unknown is never retried on another line; a hard failure is",
  async () => {
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
    assertStrictEquals(r1.status, "delivery_unknown");
    assertStrictEquals(unknown.fetch.calls.length, 1);
    assertStrictEquals(staffAlertToolResult(r1).success, true);
    assertMatch(staffAlertToolResult(r1).warning, /אל תשלחי/);

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
    assertStrictEquals(failed.fetch.calls.length, 2);
    assertStrictEquals(r2.status, "sent");
    assertStrictEquals(r2.integrationId, "manus-2");
    assertStrictEquals(r2.providerMessageId, "m2");
  },
);

Deno.test("Staging guard blocks are reported, not hidden", async () => {
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
  assertStrictEquals(result.status, "blocked_staging");
  assertMatch(staffAlertToolResult(result).error, /Staging/);
});

Deno.test(
  "sender falls back from a 'system' requester to the line user, then the tenant owner",
  async () => {
    const viaLine = send({
      integrations: [line("manus-1", { user_id: LINE_USER })],
      requesterUserId: "system",
    });
    await viaLine.run;
    assertStrictEquals(viaLine.fetch.calls[0].body.senderUserId, LINE_USER);

    const viaOwner = send({
      integrations: [line("manus-1")],
      requesterUserId: null,
      roles: [{ tenant_id: TENANT, role: "owner", user_id: OWNER }],
    });
    await viaOwner.run;
    assertStrictEquals(viaOwner.fetch.calls[0].body.senderUserId, OWNER);
  },
);

Deno.test("the outcome is written to agent_action_log", async () => {
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
  assertStrictEquals(row.action_type, "staff_whatsapp_alert");
  assertStrictEquals(row.status, "delivery_unknown");
  assertStrictEquals(row.user_id, null);
  assertStrictEquals(row.action_details.recipient_name, "אנה");
  assertStrictEquals(row.action_details.delivery_status, "delivery_unknown");
});

// ── No staff-alert path reaches send-green-api-message ───────────────────────

Deno.test(
  "send_whatsapp_to_staff delegates to the Manus-only notifier",
  async () => {
    const agent = await readFile(
      new URL("../run-ai-agent/index.ts", import.meta.url),
      "utf8",
    );
    const start = agent.indexOf("async function sendStaffWhatsappMessage(");
    const end = agent.indexOf("const corsHeaders", start);
    assert(start > 0 && end > start);
    const fn = agent.slice(start, end);
    assertMatch(fn, /sendStaffAlert\(/);
    assertNotMatch(
      fn,
      /send-green-api-message|green_?api|manage-manus-wa|functions\/v1/i,
    );

    const notifier = await readFile(
      new URL("./staff-notify.ts", import.meta.url),
      "utf8",
    );
    assertNotMatch(notifier, /send-green-api-message|green_?api|greenapi/i);
    assertMatch(notifier, /send-manus-wa-message/);
  },
);

Deno.test(
  "agent-heartbeat sends no WhatsApp and uses the Israel hour",
  async () => {
    const heartbeat = await readFile(
      new URL("../agent-heartbeat/index.ts", import.meta.url),
      "utf8",
    );
    assertNotMatch(heartbeat, /send-green-api-message|send-manus-wa-message/);
    assertNotMatch(heartbeat, /daily_digest_sent/);
    assertNotMatch(heartbeat, /getUTCHours\(\)\s*\+\s*3/);
    assertMatch(heartbeat, /jerusalemHour\(now\)/);
    // Overdue cutoff and summary date are Israel dates, not UTC ones.
    assertNotMatch(heartbeat, /toISOString\(\)\.split\("T"\)/);
    assertMatch(heartbeat, /\.lt\("due_date", jerusalemYmd\(now\)\)/);
    // task_updates has no tenant_id and user_id is a profiles uuid.
    assertNotMatch(heartbeat, /user_id:\s*"system"/);
  },
);

Deno.test("jerusalemHour follows DST where getUTCHours()+3 does not", () => {
  // Summer (IDT, UTC+3) and winter (IST, UTC+2) around 2026-10-25.
  assertStrictEquals(jerusalemHour(new Date("2026-10-24T04:30:00Z")), 7);
  assertStrictEquals(jerusalemHour(new Date("2026-10-26T04:30:00Z")), 6);
  assertStrictEquals(new Date("2026-10-26T04:30:00Z").getUTCHours() + 3, 7);
  // Midnight wraps to 0, never 24.
  assertStrictEquals(jerusalemHour(new Date("2026-07-01T21:30:00Z")), 0);
  assertStrictEquals(jerusalemHour(new Date("2026-12-31T22:15:00Z")), 0);
});
