import { assertEquals } from "jsr:@std/assert@1";
import type {
  CampaignerAssignment,
  PeopleDirectory,
  StaffMember,
} from "./directory.ts";
import { resolveBriefRecipients, resolveClientRecipients } from "./resolve.ts";

const TODAY = "2026-11-01";
const client = { id: "c1", agency_id: "a1", name: "לקוח א" };

/** A current non-campaign assignment of campaigner k1; `fields` override any part. */
function assignment(
  fields: Partial<CampaignerAssignment>,
): CampaignerAssignment {
  return {
    campaigner_id: "k1",
    user_id: null,
    name: "קמפיינר",
    phone: null,
    campaign_role: false,
    start_date: null,
    end_date: null,
    ...fields,
  };
}

/** A staff member with no roles; `fields` override any part. */
function staffMember(fields: Partial<StaffMember>): StaffMember {
  return {
    user_id: "u1",
    name: "איש צוות",
    phone: "050-1234567",
    roles: [],
    managed_agency_ids: [],
    ...fields,
  };
}

/** A directory with these assignments; `known` false hides the client. */
function directory(
  assignments: CampaignerAssignment[],
  known = true,
): PeopleDirectory {
  return {
    client: () => Promise.resolve(known ? client : null),
    campaigners: () => Promise.resolve(assignments),
    staff: () => Promise.resolve([]),
    names: () => Promise.resolve(new Map()),
    contacts: () => Promise.resolve(new Map()),
  };
}

const staff = [
  staffMember({ user_id: "owner", name: "דוד", roles: ["owner"] }),
  staffMember({
    user_id: "tm",
    name: "אבי",
    roles: ["team_manager"],
    managed_agency_ids: ["a1"],
  }),
  staffMember({
    user_id: "other-tm",
    name: "רוני",
    roles: ["team_manager"],
    managed_agency_ids: ["a2"],
  }),
  staffMember({
    user_id: "ao",
    name: "מיכל",
    roles: ["agency_owner"],
    managed_agency_ids: ["a1"],
    phone: null,
  }),
];

Deno.test("resolveClientRecipients", async (t) => {
  await t.step(
    "active campaigners only, campaign role first, profile phone normalised",
    async () => {
      const people = await resolveClientRecipients(
        directory([
          assignment({
            campaigner_id: "k1",
            user_id: "u-dana",
            name: "דנה",
            phone: "050-1111111",
          }),
          assignment({
            campaigner_id: "k2",
            name: "יוסי",
            phone: "0502222222",
            campaign_role: true,
          }),
          assignment({
            campaigner_id: "k3",
            name: "סיים",
            end_date: "2026-10-31",
          }),
          assignment({
            campaigner_id: "k4",
            name: "עתידי",
            start_date: "2026-11-02",
          }),
        ]),
        { tenantId: "t", clientId: "c1", today: TODAY, staff },
      );
      assertEquals(
        people.campaigners.map((r) => [r.key, r.name, r.phone]),
        [
          ["campaigner:k2", "יוסי", "972502222222"],
          ["user:u-dana", "דנה", "972501111111"],
        ],
      );
    },
  );

  await t.step(
    "managers of the client's agency only; an agency owner without a phone stays, phoneless",
    async () => {
      const people = await resolveClientRecipients(directory([]), {
        tenantId: "t",
        clientId: "c1",
        today: TODAY,
        staff,
      });
      assertEquals(people.campaigners, []);
      assertEquals(
        people.managers.map((r) => [r.key, r.phone]),
        [
          ["user:tm", "972501234567"],
          ["user:ao", null],
        ],
      );
    },
  );

  await t.step("a client the tenant cannot reach has nobody", async () => {
    const people = await resolveClientRecipients(
      directory([assignment({})], false),
      { tenantId: "t", clientId: "c1", today: TODAY, staff },
    );
    assertEquals(
      [people.client, people.campaigners, people.managers],
      [null, [], []],
    );
  });
});

Deno.test("resolveBriefRecipients", async (t) => {
  const keys = (members: StaffMember[], chosen: string[]) =>
    resolveBriefRecipients(members, { brief_recipients: chosen }).map(
      (r) => r.key,
    );

  await t.step("chosen staff, else the tenant owners", () => {
    assertEquals(keys(staff, []), ["user:owner"]);
    assertEquals(keys(staff, ["tm", "stranger"]), ["user:tm"]);
  });

  await t.step(
    "a choice matching no staff falls back to the owners, then the agency owners",
    () => {
      assertEquals(keys(staff, ["stranger"]), ["user:owner"]);
      const agencyOnly = staff.filter((m) => !m.roles.includes("owner"));
      assertEquals(keys(agencyOnly, []), ["user:ao"]);
    },
  );
});
