import { assertEquals } from "jsr:@std/assert@1";
import { searchTenantId } from "./caller-tenant.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";

/** A user-tenant lookup that records whom it was asked about. */
function lookup(answer: string | null) {
  const asked: Array<string> = [];
  return {
    asked,
    userTenant: (userId: string) => {
      asked.push(userId);
      return Promise.resolve(answer);
    },
  };
}

Deno.test("the service role searches for the tenant it names", async () => {
  const users = lookup("other");
  assertEquals(
    await searchTenantId(
      { kind: "service", userId: null },
      { tenant_id: TENANT },
      users.userTenant,
    ),
    TENANT,
  );
  assertEquals(users.asked, []);
});

Deno.test("the service role without a valid tenant_id is refused", async () => {
  for (const body of [{}, { tenant_id: "x" }, { tenant_id: 7 }]) {
    assertEquals(
      await searchTenantId(
        { kind: "service", userId: null },
        body,
        lookup(TENANT).userTenant,
      ),
      null,
    );
  }
});

Deno.test(
  "a user searches in their own active tenant, never a named one",
  async () => {
    const users = lookup(TENANT);
    assertEquals(
      await searchTenantId(
        { kind: "user", userId: "u1" },
        { tenant_id: "22222222-2222-4222-8222-222222222222" },
        users.userTenant,
      ),
      TENANT,
    );
    assertEquals(users.asked, ["u1"]);
  },
);
