import { assertStrictEquals } from "jsr:@std/assert@1";

import {
  stepMayUseLine,
  stepSender,
  type LineAccessInput,
} from "./line-access.ts";
import {
  DAVID_USER,
  greenLine,
  manusLine,
  manusStep,
  TENANT,
} from "./test-fixtures.ts";

const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const FOREIGN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LINE_USER = "44444444-4444-4444-8444-444444444444";

const step = manusStep("auto-1", null);
const own = manusLine("manus-own");
/** Another tenant's Manus line, owned by LINE_USER. */
const foreign = {
  ...manusLine(FOREIGN, true, LINE_USER),
  tenant_id: OTHER_TENANT,
};
/** auto-1's sends go out as DAVID_USER. */
const asDavid: LineAccessInput = {
  tenantId: TENANT,
  senderUserIds: { "auto-1": DAVID_USER },
};

Deno.test("stepSender", async (t) => {
  await t.step(
    "the automation's session user, else the tenant's own Manus line's user",
    () => {
      const noSession = { tenantId: TENANT };
      const ownWithUser = manusLine("manus-own", true, LINE_USER);
      assertStrictEquals(
        stepSender(asDavid, step, foreign, "manus"),
        DAVID_USER,
      );
      assertStrictEquals(
        stepSender(noSession, step, ownWithUser, "manus"),
        LINE_USER,
      );
      // Another tenant's line never lends its owner as the sender.
      assertStrictEquals(stepSender(noSession, step, foreign, "manus"), null);
      const green = greenLine("green-1", { user_id: LINE_USER });
      assertStrictEquals(stepSender(noSession, step, green, "green"), null);
    },
  );
});

Deno.test("stepMayUseLine", async (t) => {
  await t.step(
    "the tenant's own line, a shared one, or any line for a super-admin sender",
    () => {
      const may = (input: LineAccessInput, line = foreign) =>
        stepMayUseLine(input, step, line, "manus");
      assertStrictEquals(may(asDavid, own), true);
      assertStrictEquals(may(asDavid), false);
      assertStrictEquals(may({ ...asDavid, sharedLineIds: [FOREIGN] }), true);
      assertStrictEquals(
        may({ ...asDavid, superAdminUserIds: [DAVID_USER] }),
        true,
      );
      // A super admin who owns the foreign line does not open it to this tenant.
      assertStrictEquals(
        may({ ...asDavid, superAdminUserIds: [LINE_USER] }),
        false,
      );
      assertStrictEquals(
        may({ tenantId: TENANT, superAdminUserIds: [LINE_USER] }),
        false,
      );
    },
  );
});
