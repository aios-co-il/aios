import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabase } from "../testing/fake-supabase.mjs";
import { resolveInstantAlertRecipients } from "./recipients.ts";

const TENANT = "tenant-a";

const REPORT = [
  { name: "Felix", phone: "972500000011", source: "configured" as const },
  { name: "David", phone: "972500000012", source: "configured" as const },
];

function tables() {
  return {
    user_roles: [
      { tenant_id: TENANT, user_id: "m-1", role: "team_manager" },
      { tenant_id: TENANT, user_id: "m-2", role: "team_manager" },
      { tenant_id: TENANT, user_id: "o-1", role: "owner" },
      { tenant_id: "tenant-b", user_id: "m-3", role: "team_manager" },
    ],
    user_managed_agencies: [
      { user_id: "m-1", agency_id: "agency-1" },
      { user_id: "m-2", agency_id: "agency-2" },
      { user_id: "m-3", agency_id: "agency-1" },
    ],
    profiles: [
      {
        id: "m-1",
        full_name: "Manager One",
        campaigners: { phone: "0500000021" },
      },
      {
        id: "m-2",
        full_name: "Manager Two",
        campaigners: { phone: "0500000022" },
      },
      { id: "o-1", full_name: "Owner", campaigners: { phone: "0500000023" } },
      {
        id: "m-3",
        full_name: "Other Org",
        campaigners: { phone: "0500000024" },
      },
    ],
  };
}

Deno.test("resolveInstantAlertRecipients", async (t) => {
  await t.step(
    "report recipients fill the owner slot, then the agency's managers",
    async () => {
      const recipients = await resolveInstantAlertRecipients(
        fakeSupabase(tables()),
        TENANT,
        "agency-1",
        REPORT,
      );

      assertEquals(recipients, [
        { phone: "972500000011", label: "Felix" },
        { phone: "972500000012", label: "David" },
        { phone: "972500000021", label: "Manager One" },
      ]);
    },
  );

  await t.step("owners outside the report list are not added", async () => {
    const recipients = await resolveInstantAlertRecipients(
      fakeSupabase(tables()),
      TENANT,
      "agency-2",
      [REPORT[0]],
    );

    assertEquals(
      recipients.map((r) => r.label),
      ["Felix", "Manager Two"],
    );
  });

  await t.step(
    "a manager who is also a report recipient appears once",
    async () => {
      const recipients = await resolveInstantAlertRecipients(
        fakeSupabase(tables()),
        TENANT,
        "agency-1",
        [
          {
            name: "Manager (report)",
            phone: "972500000021",
            source: "configured",
          },
        ],
      );

      assertEquals(recipients, [
        { phone: "972500000021", label: "Manager (report)" },
      ]);
    },
  );

  await t.step(
    "a failed manager lookup still alerts the report recipients",
    async () => {
      const db = fakeSupabase(tables());
      const failing = {
        from: (table: string) =>
          table === "user_roles"
            ? {
                select: () => ({
                  eq: () => ({
                    eq: async () => ({
                      data: null,
                      error: { message: "boom" },
                    }),
                  }),
                }),
              }
            : db.from(table),
      };

      const recipients = await resolveInstantAlertRecipients(
        failing,
        TENANT,
        "agency-1",
        REPORT,
      );

      assertEquals(
        recipients.map((r) => r.label),
        ["Felix", "David"],
      );
    },
  );
});
