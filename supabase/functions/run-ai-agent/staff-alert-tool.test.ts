import {
  assertEquals,
  assertMatch,
  assertObjectMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeFetch } from "../_shared/testing/fake-fetch.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { sendStaffWhatsappMessage } from "./staff-alert-tool.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const REQUESTER = "33333333-3333-4333-8333-333333333333";

/** An active line of TENANT. */
const line = (id: string, integration_type: string) => ({
  id,
  tenant_id: TENANT,
  integration_type,
  is_active: true,
  user_id: null,
  created_at: "2026-01-01",
});

/** The staff tool over a fake DB holding these lines and a fake send-manus-wa-message giving these responses; REQUESTER is a member of TENANT. */
async function runTool(
  integrations: Record<string, unknown>[],
  responses?: { status?: number; body?: unknown }[],
) {
  const sb = fakeSupabase({
    tenant_integrations: integrations,
    tenant_users: [{ tenant_id: TENANT, user_id: REQUESTER }],
  });
  const fetch = fakeFetch(responses);
  const result = await sendStaffWhatsappMessage({
    supabase: sb,
    supabaseUrl: "https://this-project.supabase.co",
    serviceRoleKey: "service-key",
    tenantId: TENANT,
    phone: "050-123-4567",
    message: "תזכורת",
    requesterUserId: REQUESTER,
    recipient: { entity_type: "campaigner", id: "c1", full_name: "אנה" },
    fetchImpl: fetch.impl,
  });
  return { result, sb, fetch };
}

Deno.test("sendStaffWhatsappMessage", async (t) => {
  await t.step(
    "send_whatsapp_to_staff delegates to the Manus-only notifier",
    async () => {
      const { result, sb, fetch } = await runTool([
        line("green-1", "green_api"),
        line("manus-1", "manus_wa"),
      ]);
      assertEquals(
        fetch.calls.map((c) => c.url),
        ["https://this-project.supabase.co/functions/v1/send-manus-wa-message"],
      );
      assertObjectMatch(result, {
        success: true,
        status: "sent",
        provider: "manus_wa",
        integration_id: "manus-1",
      });
      const [logged] =
        sb.inserts.find((i) => i.table === "agent_action_log")?.rows ?? [];
      assertObjectMatch(logged, {
        action_type: "staff_whatsapp_alert",
        status: "success",
        user_id: REQUESTER,
      });
    },
  );

  await t.step(
    "with only a Green API line nothing is sent and the miss is logged",
    async () => {
      const { result, sb, fetch } = await runTool([
        line("green-1", "green_api"),
      ]);
      assertStrictEquals(fetch.calls.length, 0);
      assertStrictEquals(result.status, "no_line");
      assertMatch(result.error ?? "", /Manus/);
      const [logged] =
        sb.inserts.find((i) => i.table === "agent_action_log")?.rows ?? [];
      assertObjectMatch(logged, { status: "error" });
    },
  );

  await t.step(
    "a 202 from Manus succeeds with a do-not-resend warning",
    async () => {
      const { result, fetch } = await runTool(
        [line("manus-1", "manus_wa")],
        [{ status: 202, body: { success: false, delivered: "unknown" } }],
      );
      assertStrictEquals(fetch.calls.length, 1);
      assertStrictEquals(result.status, "delivery_unknown");
      assertStrictEquals(result.success, true);
      assertMatch(result.warning ?? "", /אל תשלחי/);
    },
  );

  await t.step("a Staging guard block is an error naming Staging", async () => {
    const { result } = await runTool(
      [line("manus-1", "manus_wa")],
      [
        {
          status: 403,
          body: {
            error: "blocked_by_staging_safe_mode",
            reason: "empty_allowlist",
          },
        },
      ],
    );
    assertStrictEquals(result.status, "blocked_staging");
    assertMatch(result.error ?? "", /Staging/);
  });
});
