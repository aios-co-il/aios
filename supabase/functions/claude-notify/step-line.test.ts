import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  resolveStepLine,
  type NotifyTransportInput,
  type TransportContext,
} from "./step-line.ts";
import { DAVID_USER, manusLine, manusStep, TENANT } from "./test-fixtures.ts";

const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const FOREIGN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LINE_USER = "44444444-4444-4444-8444-444444444444";

/** Another tenant's primary Manus line, owned by LINE_USER. */
const foreign = {
  ...manusLine(FOREIGN, true, LINE_USER),
  tenant_id: OTHER_TENANT,
};

/** A tenant with no line of its own whose Carmen trigger pins `foreign`. */
const pinned: NotifyTransportInput = {
  tenantId: TENANT,
  activeAutomationIds: ["auto-1"],
  steps: [],
  integrations: [foreign],
  triggerPins: { "auto-1": FOREIGN },
};

/** The line a step that names none resolves to, and what was skipped. */
function resolve(extra: Partial<NotifyTransportInput>) {
  const ctx: TransportContext = {
    input: { ...pinned, ...extra },
    hasActiveManus: false,
    byId: new Map([[FOREIGN, foreign]]),
    skipped: [],
  };
  const line = resolveStepLine(ctx, manusStep("auto-1", null), "manus");
  return { line: line?.id ?? null, skipped: ctx.skipped };
}

Deno.test("resolveStepLine", async (t) => {
  await t.step(
    "a pin to another tenant's line is used only when shared or the sender is a super admin",
    () => {
      const senderUserIds = { "auto-1": DAVID_USER };
      assertEquals(resolve({ senderUserIds }), {
        line: null,
        skipped: [
          {
            automationId: "auto-1",
            integrationId: FOREIGN,
            role: "primary",
            reason: "not_shared",
          },
        ],
      });
      assertStrictEquals(
        resolve({ senderUserIds, sharedLineIds: [FOREIGN] }).line,
        FOREIGN,
      );
      assertStrictEquals(
        resolve({ senderUserIds, superAdminUserIds: [DAVID_USER] }).line,
        FOREIGN,
      );
      // With no session sender, the line's own user sends: their access counts.
      assertStrictEquals(
        resolve({ superAdminUserIds: [LINE_USER] }).line,
        FOREIGN,
      );
    },
  );
});
