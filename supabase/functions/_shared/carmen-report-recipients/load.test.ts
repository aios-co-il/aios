import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabase } from "../testing/fake-supabase.mjs";
import { loadCarmenReportRecipients } from "./load.ts";

const TENANT = "tenant-a";

const STAFF = [
  {
    user_id: "u-owner",
    full_name: "Owner",
    phone: "0500000001",
    is_owner: true,
  },
  {
    user_id: "u-member",
    full_name: "Member",
    phone: "0500000002",
    is_owner: false,
  },
];

function db(rows: unknown[]) {
  const staffCalls: unknown[] = [];
  const client = fakeSupabase(
    { carmen_report_recipients: rows },
    {
      rpc: {
        carmen_report_staff: (args: unknown) => (staffCalls.push(args), STAFF),
      },
    },
  );
  return { client, staffCalls };
}

Deno.test("loadCarmenReportRecipients", async (t) => {
  await t.step("reads this tenant's list, oldest first", async () => {
    const { client, staffCalls } = db([
      {
        tenant_id: TENANT,
        user_id: "u-member",
        phone: null,
        label: null,
        created_at: "2026-10-27T10:00:00Z",
      },
      {
        tenant_id: "tenant-b",
        user_id: null,
        phone: "+972500000099",
        label: "Other org",
        created_at: "2026-10-27T09:00:00Z",
      },
    ]);

    const result = await loadCarmenReportRecipients(client, TENANT);

    assertEquals(result.error, null);
    assertEquals(
      result.recipients.map((r) => [r.user_id, r.phone, r.source]),
      [["u-member", "972500000002", "configured"]],
    );
    assertEquals(staffCalls, [{ p_tenant_id: TENANT }]);
    const listQuery = client.queries.find(
      (q: { table: string }) => q.table === "carmen_report_recipients",
    );
    assertEquals(listQuery.filters, [["eq", "tenant_id", TENANT]]);
    assertEquals(listQuery.order, { col: "created_at", asc: true });
  });

  await t.step("an empty list resolves to the owners", async () => {
    const result = await loadCarmenReportRecipients(db([]).client, TENANT);

    assertEquals(
      result.recipients.map((r) => [r.user_id, r.source]),
      [["u-owner", "owner_fallback"]],
    );
  });

  await t.step(
    "a failed staff read returns no recipients and the error",
    async () => {
      const client = {
        ...db([]).client,
        rpc: async () => ({
          data: null,
          error: { message: "permission denied" },
        }),
      };

      const result = await loadCarmenReportRecipients(client, TENANT);

      assertEquals(result, {
        recipients: [],
        skipped: [],
        error: "permission denied",
      });
    },
  );
});
