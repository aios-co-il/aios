import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { resolveChatScope } from "./resolve.ts";
import { isActiveAssignment } from "./staff-scope.ts";
import {
  AG1,
  CA,
  CB,
  DANA,
  DAVID,
  GA,
  GB,
  GC,
  ORG_LINE,
  SP,
  T,
  T2,
  base,
  role,
  world,
} from "./test-fixtures.ts";

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

Deno.test("resolveChatScope: staff callers", async (t) => {
  await t.step(
    "in-app campaigner gets active client_team clients only",
    async () => {
      const { db, rpcCalls } = world({
        user_roles: [role(DANA, "campaigner")],
      });
      const scope = await resolveChatScope(db, {
        ...base,
        userId: DANA,
        callerCampaignerId: null,
      });
      assertStrictEquals(scope.mode, "staff");
      assertEquals(scope.clientIds, [CA], "ended assignment to C dropped");
      assertEquals(scope.linkedGroupIds, [GA]);
      assertEquals(scope.connectionUserIds, [DANA, ORG_LINE]);
      assertStrictEquals(scope.ownThread, null);
      assertEquals(rpcCalls, [
        {
          fn: "chat_allowed_connection_user_ids",
          args: { p_tenant_id: T, p_user_id: DANA },
        },
      ]);
    },
  );

  await t.step("team manager gets the agency's clients and leads", async () => {
    const managed = [{ user_id: DANA, agency_id: AG1 }];
    const { db } = world({
      user_roles: [role(DANA, "team_manager")],
      user_managed_agencies: managed,
    });
    const scope = await resolveChatScope(db, {
      ...base,
      userId: DANA,
      callerCampaignerId: null,
    });
    assert(scope.clientIds !== "all");
    assertEquals([...scope.clientIds].sort(), [CA, CB].sort());
    assertEquals(scope.leads.agencyIds, [AG1]);
    assertEquals([...scope.linkedGroupIds].sort(), [GA, GB].sort());

    // Managed agencies count only with the team_manager role in this tenant.
    const elsewhere = await resolveChatScope(
      world({
        user_roles: [role(DANA, "team_manager", T2), role(DANA, "campaigner")],
        user_managed_agencies: managed,
      }).db,
      { ...base, userId: DANA, callerCampaignerId: null },
    );
    assertEquals(elsewhere.clientIds, [CA]);
    assertEquals(elsewhere.leads.agencyIds, []);
  });

  await t.step(
    "agency owner reads all linked threads, sales person own leads",
    async () => {
      const { db } = world({ user_roles: [role(DANA, "agency_owner")] });
      const tenantWide = await resolveChatScope(db, {
        ...base,
        userId: DANA,
        callerCampaignerId: null,
      });
      assertStrictEquals(tenantWide.clientIds, "all");
      assertStrictEquals(tenantWide.leads.all, true);
      assertEquals([...tenantWide.linkedGroupIds].sort(), [GA, GB, GC].sort());
      const sales = await resolveChatScope(
        world({ user_roles: [role(DAVID, "sales_person")] }).db,
        { ...base, userId: DAVID, callerCampaignerId: null },
      );
      assertStrictEquals(sales.leads.salesPersonId, SP);
      assertEquals(sales.clientIds, []);
    },
  );

  await t.step("a failing profile lookup rejects", async () => {
    const { db } = fakeDb(
      { user_roles: [role(DANA, "campaigner")] },
      { chat_allowed_connection_user_ids: () => [DANA] },
      { profiles: new Error("db down") },
    );
    await assertRejects(
      () =>
        resolveChatScope(db, {
          ...base,
          userId: DANA,
          callerCampaignerId: null,
        }),
      Error,
      "db down",
    );
  });
});
