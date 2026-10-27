import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeFetch } from "../_shared/testing/fake-fetch.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { MANUS_WA_TYPES } from "../_shared/whatsapp/send-result.ts";
import {
  sendStaffAlert,
  STAFF_ALERT_NO_PRIMARY_LINE_HE,
} from "./staff-alert.ts";
import { staffAlertToolResult } from "./staff-alert-tool-result.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const REQUESTER = "33333333-3333-4333-8333-333333333333";
const LINE_USER = "44444444-4444-4444-8444-444444444444";
const OWNER = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

/** An active manus_wa line of TENANT. */
const line = (id: string, extra: Row = {}) => ({
  id,
  tenant_id: TENANT,
  integration_type: "manus_wa",
  is_active: true,
  user_id: null,
  created_at: "2026-01-01",
  ...extra,
});
const greenLine = line("green-1", { integration_type: "green_api" });

/** sendStaffAlert to 050-123-4567 over a fake DB and fetch. */
function send({
  integrations,
  responses,
  requesterUserId = REQUESTER,
  roles = [],
  failing,
}: {
  integrations: Row[];
  responses?: { status?: number; body?: unknown }[];
  requesterUserId?: string | null;
  roles?: Row[];
  failing?: Record<string, string>;
}) {
  const sb = fakeSupabase(
    { tenant_integrations: integrations, user_roles: roles },
    { failing },
  );
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

Deno.test("sendStaffAlert", async (t) => {
  await t.step(
    "sends only through send-manus-wa-message on a Manus line",
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
      assertMatch(
        fetch.calls[0].url,
        /\/functions\/v1\/send-manus-wa-message$/,
      );
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

      const lineQuery = sb.queries.find(
        (q) => q.table === "tenant_integrations",
      );
      const typeFilter = lineQuery?.filters.find(
        ([op, col]) => op === "in" && col === "integration_type",
      );
      // send-manus-wa-message only accepts manus_wa rows, so no alias.
      assertEquals(typeFilter?.[2], ["manus_wa"]);
      assertEquals(MANUS_WA_TYPES, ["manus_wa"]);
      assertMatch(lineQuery?.columns ?? "", /\bsettings\b/);
    },
  );

  await t.step(
    "skips a newer secondary Manus line and sends from Carmen's line",
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

  await t.step(
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

  await t.step(
    "a tenant with only a Green API line gets no_line and nothing is sent",
    async () => {
      const { run, fetch } = send({ integrations: [greenLine] });
      const result = await run;
      assertStrictEquals(result.status, "no_line");
      assertStrictEquals(result.sent, false);
      assertStrictEquals(fetch.calls.length, 0);
      assertMatch(staffAlertToolResult(result).error ?? "", /Manus/);
    },
  );

  await t.step(
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
      assertMatch(staffAlertToolResult(r1).warning ?? "", /אל תשלחי/);

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

  await t.step("Staging guard blocks are reported, not hidden", async () => {
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
    assertMatch(staffAlertToolResult(result).error ?? "", /Staging/);
  });

  await t.step(
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

  await t.step(
    "a failed line or owner lookup is a generic failure, not no_line / no_sender",
    async () => {
      for (const table of ["tenant_integrations", "user_roles"]) {
        const { run, fetch } = send({
          integrations: [line("manus-1")],
          requesterUserId: null,
          failing: { [table]: "permission denied for table" },
        });
        const result = await run;
        assertStrictEquals(result.status, "failed", table);
        assertStrictEquals(result.error, "שליחה נכשלה", table);
        assertStrictEquals(fetch.calls.length, 0, table);
      }
    },
  );
});
