import { assertStrictEquals } from "jsr:@std/assert@1";

import {
  handler,
  notifyBody,
  PHONE,
  post,
  SERVICE_KEY,
  TENANT,
  tenantTables,
} from "./test-fixtures.ts";

/** David as an active team manager of TENANT, for the staff session chain. */
const DAVID_MANAGER = {
  tenant_id: TENANT,
  full_name: "David",
  phone: PHONE,
  role: "מנהל צוות",
  active: true,
};

/** A tenant whose campaigners include David, with this report list. */
const staffTables = (reportList = tenantTables().carmen_report_recipients) => ({
  ...tenantTables(),
  carmen_report_recipients: reportList,
  campaigners: [DAVID_MANAGER],
});

Deno.test("loadNotifyRecipients", async (t) => {
  await t.step(
    "with an empty report list the notify keeps the staff session, not the owner",
    async () => {
      const { handle, fetch } = handler({
        tables: staffTables([]),
        rpc: {
          carmen_report_staff: () => [
            {
              user_id: "33333333-3333-4333-8333-333333333333",
              full_name: "Owner",
              phone: "0509999999",
              is_owner: true,
            },
          ],
        },
      });
      const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.source, "tenant_staff_session");
      assertStrictEquals(fetch.calls[0].body.phoneNumber, PHONE);
    },
  );

  await t.step(
    "a failed report-list read leaves the staff session to decide",
    async () => {
      const { handle, fetch } = handler({
        tables: staffTables(),
        failing: { carmen_report_recipients: "permission denied for table" },
      });
      const res = await handle(post(notifyBody, SERVICE_KEY));
      assertStrictEquals(res.status, 200);
      const out = await res.json();
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.source, "tenant_staff_session");
      assertStrictEquals(fetch.calls[0].body.phoneNumber, PHONE);
    },
  );
});
