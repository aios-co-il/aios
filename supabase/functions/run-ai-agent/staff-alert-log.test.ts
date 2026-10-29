import { assertObjectMatch, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import type { StaffAlertResult } from "../_shared/staff-alert/send.ts";
import { logStaffAlertOutcome } from "./staff-alert-log.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";

const deliveryUnknown: StaffAlertResult = {
  sent: false,
  status: "delivery_unknown",
  transport: "manus_wa",
  integrationId: "manus-1",
  providerMessageId: null,
  error: "delivery_unknown",
  phone: "972501234567",
};

Deno.test("logStaffAlertOutcome", async (t) => {
  await t.step("the outcome is written to agent_action_log", async () => {
    const sb = fakeSupabase({});
    await logStaffAlertOutcome(sb, {
      tenantId: TENANT,
      userId: "system",
      recipient: { entity_type: "campaigner", id: "c1", full_name: "אנה" },
      result: deliveryUnknown,
    });
    const [row] =
      sb.inserts.find((i) => i.table === "agent_action_log")?.rows ?? [];
    assertObjectMatch(row, {
      action_type: "staff_whatsapp_alert",
      status: "delivery_unknown",
      user_id: null,
      action_details: {
        recipient_name: "אנה",
        delivery_status: "delivery_unknown",
      },
    });
  });

  await t.step(
    "a failed insert is logged and never thrown to the tool",
    async () => {
      const sb = fakeSupabase(
        {},
        { failing: { agent_action_log: "permission denied" } },
      );
      const warnings: unknown[][] = [];
      const warn = console.warn;
      console.warn = (...a: unknown[]) => warnings.push(a);
      try {
        await logStaffAlertOutcome(sb, {
          tenantId: TENANT,
          result: deliveryUnknown,
        });
      } finally {
        console.warn = warn;
      }
      assertStrictEquals(warnings.length, 1);
      assertStrictEquals(warnings[0][1], "permission denied");
    },
  );
});
