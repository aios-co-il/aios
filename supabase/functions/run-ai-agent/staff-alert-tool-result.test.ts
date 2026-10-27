import { assertEquals } from "jsr:@std/assert@1";

import type { StaffAlertResult } from "./staff-alert.ts";
import { staffAlertToolResult } from "./staff-alert-tool-result.ts";

/** A Manus send outcome on manus-1. */
const outcome = (fields: Partial<StaffAlertResult>): StaffAlertResult => ({
  sent: false,
  status: "failed",
  transport: "manus_wa",
  integrationId: "manus-1",
  providerMessageId: null,
  error: null,
  phone: "972501234567",
  ...fields,
});

const common = { provider: "manus_wa", integration_id: "manus-1" };

Deno.test("staffAlertToolResult", async (t) => {
  await t.step("a confirmed send carries the provider message id", () => {
    assertEquals(
      staffAlertToolResult(
        outcome({ sent: true, status: "sent", providerMessageId: "m1" }),
      ),
      { success: true, status: "sent", ...common, message_id: "m1" },
    );
  });

  await t.step(
    "delivery_unknown and duplicate skips succeed with a do-not-resend warning",
    () => {
      for (const status of ["delivery_unknown", "duplicate_skipped"] as const) {
        const result = staffAlertToolResult(outcome({ status }));
        assertEquals(result.success, true, status);
        assertEquals(typeof result.warning, "string", status);
        assertEquals(result.error, undefined, status);
      }
    },
  );

  await t.step("a Staging block and a failure are errors", () => {
    assertEquals(
      staffAlertToolResult(outcome({ status: "blocked_staging" })).error,
      "השליחה נחסמה בסביבת Staging: המספר לא ברשימת המספרים המותרים.",
    );
    assertEquals(
      staffAlertToolResult(outcome({ error: "HTTP 500" })).error,
      "HTTP 500",
    );
    assertEquals(staffAlertToolResult(outcome({})).error, "שליחה נכשלה");
  });
});
