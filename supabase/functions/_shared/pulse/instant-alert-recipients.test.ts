import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { fakeSupabase } from "../testing/fake-supabase.ts";
import {
  ACME,
  fakeSupabase as fakeAlertLog,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";
import { resolveInstantAlertRecipients } from "./instant-alert-recipients.ts";

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
      { tenant_id: TENANT, user_id: "o-2", role: "agency_owner" },
      { tenant_id: TENANT, user_id: "c-1", role: "campaigner" },
      { tenant_id: "tenant-b", user_id: "m-3", role: "team_manager" },
      { tenant_id: "tenant-b", user_id: "o-3", role: "owner" },
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
        id: "o-2",
        full_name: "Agency Owner",
        campaigners: { phone: "0500000025" },
      },
      {
        id: "c-1",
        full_name: "Campaigner",
        campaigners: { phone: "0500000026" },
      },
      {
        id: "o-3",
        full_name: "Other Org Owner",
        campaigners: { phone: "0500000027" },
      },
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
    "report recipients first, then the owners, then the agency's managers",
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
        { phone: "972500000023", label: "Owner" },
        { phone: "972500000025", label: "Agency Owner" },
        { phone: "972500000021", label: "Manager One" },
      ]);
    },
  );

  await t.step(
    "owners still get the alert alongside a configured list",
    async () => {
      const recipients = await resolveInstantAlertRecipients(
        fakeSupabase(tables()),
        TENANT,
        "agency-2",
        [REPORT[0]],
      );

      assertEquals(
        recipients.map((r) => r.label),
        ["Felix", "Owner", "Agency Owner", "Manager Two"],
      );
    },
  );

  await t.step("an owner already on the list is alerted once", async () => {
    const recipients = await resolveInstantAlertRecipients(
      fakeSupabase(tables()),
      TENANT,
      "agency-2",
      [{ name: "Owner (report)", phone: "972500000023", source: "configured" }],
    );

    assertEquals(recipients, [
      { phone: "972500000023", label: "Owner (report)" },
      { phone: "972500000025", label: "Agency Owner" },
      { phone: "972500000022", label: "Manager Two" },
    ]);
  });

  await t.step(
    "with an empty list the owners are not doubled by the fallback",
    async () => {
      const recipients = await resolveInstantAlertRecipients(
        fakeSupabase(tables()),
        TENANT,
        "agency-2",
        [
          {
            user_id: "o-1",
            name: "Owner",
            phone: "972500000023",
            source: "owner_fallback",
          },
        ],
      );

      assertEquals(
        recipients.map((r) => r.phone),
        ["972500000023", "972500000025", "972500000022"],
      );
    },
  );

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
        { phone: "972500000023", label: "Owner" },
        { phone: "972500000025", label: "Agency Owner" },
      ]);
    },
  );

  await t.step(
    "a failed staff lookup still alerts the report recipients",
    async () => {
      const recipients = await resolveInstantAlertRecipients(
        fakeSupabase(tables(), { failing: { user_roles: "boom" } }),
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

  await t.step(
    "a failed managed-agencies lookup still alerts the owners",
    async () => {
      const recipients = await resolveInstantAlertRecipients(
        fakeSupabase(tables(), {
          failing: { user_managed_agencies: "boom" },
        }),
        TENANT,
        "agency-1",
        [REPORT[0]],
      );

      assertEquals(
        recipients.map((r) => r.label),
        ["Felix", "Owner", "Agency Owner"],
      );
    },
  );
});

Deno.test("deliverInstantPulseAlerts to report recipients", async (t) => {
  await t.step(
    "every report recipient gets each alert; one log row and one throttle cover them all",
    async () => {
      const supabase = fakeAlertLog();
      const reportRecipients = [
        { name: "Felix", phone: "972500000011", source: "configured" as const },
        { name: "David", phone: "972500000012", source: "configured" as const },
      ];
      const first = await run(supabase, WEDNESDAY, [ACME], {
        reportRecipients,
      });

      assertStrictEquals(first.result.sent, 2); // no_contact + connection_lost
      assertEquals(first.sends.map((send) => send.phone).sort(), [
        "972500000011",
        "972500000011",
        "972500000012",
        "972500000012",
      ]);
      assertStrictEquals(supabase.log.length, 2);
      assertStrictEquals(
        supabase.log[0].recipient_phone,
        "972500000011,972500000012",
      );

      const again = await run(
        supabase,
        new Date(WEDNESDAY.getTime() + 3600e3),
        [ACME],
        { reportRecipients },
      );
      assertStrictEquals(again.sends.length, 0);
    },
  );

  await t.step(
    "with no report recipient and no agency manager an alert is skipped, not sent to a guess",
    async () => {
      const { result, sends } = await run(fakeAlertLog(), WEDNESDAY, [ACME], {
        reportRecipients: [],
      });
      assertStrictEquals(result.sent, 0);
      assertStrictEquals(sends.length, 0);
    },
  );
});
