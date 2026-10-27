import { assertRejects, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../testing/fake-supabase.ts";
import { tenantOwnerUserId } from "./owner.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "55555555-5555-4555-8555-555555555555";

Deno.test("tenantOwnerUserId", async (t) => {
  await t.step("returns the owner of this tenant only", async () => {
    const db = fakeSupabase({
      user_roles: [
        { tenant_id: "other", role: "owner", user_id: "someone-else" },
        { tenant_id: TENANT, role: "campaigner", user_id: "not-owner" },
        { tenant_id: TENANT, role: "owner", user_id: OWNER },
      ],
    });
    assertStrictEquals(await tenantOwnerUserId(db, TENANT), OWNER);
    assertStrictEquals(await tenantOwnerUserId(db, "no-such-tenant"), null);
  });

  await t.step(
    "a failed lookup throws instead of reading as no owner",
    async () => {
      const db = fakeSupabase({}, { failing: { user_roles: "timeout" } });
      await assertRejects(
        () => tenantOwnerUserId(db, TENANT),
        Error,
        "tenant owner lookup failed: timeout",
      );
    },
  );
});
