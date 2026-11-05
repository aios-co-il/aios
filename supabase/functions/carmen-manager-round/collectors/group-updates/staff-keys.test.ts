import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadGroupStaff } from "./staff-keys.ts";

const SINCE = new Date("2026-10-25T00:00:00Z");

Deno.test("loadGroupStaff", async (t) => {
  await t.step(
    "the roster of the tenant and its agency partners, either way",
    async () => {
      const { db, calls } = recordingClient(({ path }) => {
        switch (path) {
          case "agency_tenant_access":
            return [{ source_tenant_id: "t2", accessing_tenant_id: "t1" }];
          case "campaigners":
            return [{ phone: "+972 53 333 3333", tenant_id: "t2" }];
          default:
            return [];
        }
      });
      const staff = await loadGroupStaff(db, "t1", SINCE);
      assertEquals(staff.personTenants.get("533333333"), new Set(["t2"]));
      const access = calls.find((c) => c.path === "agency_tenant_access");
      assertEquals(
        access?.query.get("or"),
        "(accessing_tenant_id.eq.t1,source_tenant_id.eq.t1)",
      );
      for (const table of ["user_roles", "tenant_users", "campaigners"]) {
        const call = calls.find((c) => c.path === table);
        assertEquals(call?.query.get("tenant_id"), "in.(t1,t2)", table);
      }
    },
  );
});
