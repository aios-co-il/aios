import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { ROLE_PRIORITY, chatRoleTier, tenantRoleFor } from "./roles.ts";
import {
  DANA,
  DANA_CAMP,
  DAVID,
  MANUS,
  T,
  T2,
  role,
  world,
} from "./test-fixtures.ts";

Deno.test("chatRoleTier", async (t) => {
  await t.step("owners keep full access, others are narrowed", () => {
    assertStrictEquals(chatRoleTier("owner"), "full");
    assertStrictEquals(chatRoleTier("super_admin"), "full");
    assertStrictEquals(chatRoleTier("agency_owner"), "tenant");
    assertStrictEquals(chatRoleTier("agency_manager"), "tenant");
    assertStrictEquals(chatRoleTier("team_manager"), "team");
    assertStrictEquals(chatRoleTier("campaigner"), "member");
    assertStrictEquals(chatRoleTier("sales_person"), "member");
    assertStrictEquals(chatRoleTier(null, DANA_CAMP), "member");
    assertStrictEquals(chatRoleTier(null, null), null);
    assertStrictEquals(chatRoleTier("system"), null);
  });
});

Deno.test("tenantRoleFor", async (t) => {
  await t.step(
    "highest role in this tenant or a global one, never another tenant's",
    async () => {
      const { db, queries } = world({
        user_roles: [
          role(DANA, "owner", T2),
          role(DANA, "agency_owner", T2),
          role(DANA, "viewer"),
          role(DANA, "campaigner"),
          role(DAVID, "super_admin", null),
        ],
      });
      assertStrictEquals(await tenantRoleFor(db, T, DANA), "campaigner");
      assertStrictEquals(await tenantRoleFor(db, T2, DANA), "owner");
      assertStrictEquals(await tenantRoleFor(db, T, DAVID), "super_admin");
      assertStrictEquals(await tenantRoleFor(db, T, MANUS), null);
      assertEquals(queries[0], {
        table: "user_roles",
        ors: [`tenant_id.eq.${T},tenant_id.is.null`],
        calls: ["eq:user_id", "or"],
      });
      const before = queries.length;
      assertStrictEquals(await tenantRoleFor(db, "not-a-tenant", DANA), null);
      assertStrictEquals(await tenantRoleFor(db, T, "system"), null);
      assertStrictEquals(queries.length, before, "no query for a bad id");
      assertStrictEquals(ROLE_PRIORITY[0], "super_admin");
    },
  );
});
