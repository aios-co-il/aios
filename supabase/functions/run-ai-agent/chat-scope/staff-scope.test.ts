import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import {
  type StaffScopeInput,
  isActiveAssignment,
  staffScopeFor,
} from "./staff-scope.ts";
import {
  AG1,
  CA,
  CB,
  DANA,
  DAVID,
  GA,
  GB,
  GC,
  SP,
  T,
  base,
  world,
} from "./test-fixtures.ts";

/** Dana, an in-app campaigner in tenant T, with overrides. */
const dana = (over: Partial<StaffScopeInput> = {}): StaffScopeInput => ({
  tier: "member",
  role: "campaigner",
  userId: DANA,
  callerCampaignerId: null,
  today: base.today,
  tenantIds: [T],
  ...over,
});

Deno.test("isActiveAssignment", async (t) => {
  await t.step("today must be inside the start/end window", () => {
    const today = "2026-10-26";
    assertStrictEquals(isActiveAssignment({}, today), true);
    assertStrictEquals(
      isActiveAssignment({ end_date: "2026-10-25" }, today),
      false,
    );
    assertStrictEquals(
      isActiveAssignment({ start_date: "2026-11-01" }, today),
      false,
    );
    assertStrictEquals(
      isActiveAssignment(
        { start_date: "2026-01-01", end_date: "2026-10-26" },
        today,
      ),
      true,
    );
  });
});

Deno.test("staffScopeFor", async (t) => {
  await t.step(
    "in-app campaigner gets active client_team clients only",
    async () => {
      const scope = await staffScopeFor(world().db, dana());
      assertEquals(scope.clientIds, [CA], "ended assignment to C dropped");
      assertEquals(scope.linkedGroupIds, [GA]);
      assertEquals(scope.leads, {
        all: false,
        agencyIds: [],
        salesPersonId: null,
      });
    },
  );

  await t.step("team manager gets the agency's clients and leads", async () => {
    const { db } = world({
      user_managed_agencies: [{ user_id: DANA, agency_id: AG1 }],
    });
    const scope = await staffScopeFor(db, dana({ tier: "team" }));
    assert(scope.clientIds !== "all");
    assertEquals([...scope.clientIds].sort(), [CA, CB].sort());
    assertEquals(scope.leads.agencyIds, [AG1]);
    assertEquals([...scope.linkedGroupIds].sort(), [GA, GB].sort());

    // Managed agencies count only for the team tier.
    const member = await staffScopeFor(db, dana());
    assertEquals(member.clientIds, [CA]);
    assertEquals(member.leads.agencyIds, []);
  });

  await t.step(
    "agency owner reads all linked threads, sales person own leads",
    async () => {
      const tenantWide = await staffScopeFor(
        world().db,
        dana({ tier: "tenant", role: "agency_owner" }),
      );
      assertStrictEquals(tenantWide.clientIds, "all");
      assertStrictEquals(tenantWide.leads.all, true);
      assertEquals([...tenantWide.linkedGroupIds].sort(), [GA, GB, GC].sort());
      const sales = await staffScopeFor(
        world().db,
        dana({ role: "sales_person", userId: DAVID }),
      );
      assertStrictEquals(sales.leads.salesPersonId, SP);
      assertEquals(sales.clientIds, []);
    },
  );

  await t.step("a failing profile lookup rejects", async () => {
    const { db } = fakeDb({}, {}, { profiles: new Error("db down") });
    await assertRejects(() => staffScopeFor(db, dana()), Error, "db down");
  });
});
