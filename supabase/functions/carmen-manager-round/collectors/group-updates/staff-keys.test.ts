import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadStaffKeys } from "./staff-keys.ts";

Deno.test("loadStaffKeys", async (t) => {
  await t.step(
    "match keys of the tenant's and its agency partners' staff and lines",
    async () => {
      const { db, calls } = recordingClient((call) => {
        switch (call.path) {
          case "agency_tenant_access":
            return [{ source_tenant_id: "t2", accessing_tenant_id: "t1" }];
          case "user_roles":
            return [{ user_id: "u1" }];
          case "profiles":
            return [
              {
                id: "u1",
                full_name: "",
                phone: null,
                campaigner_id: null,
                campaigners: {
                  phone: "050-2222222",
                  tenant_id: "t1",
                  active: true,
                },
              },
            ];
          case "campaigners":
            return [{ phone: "+972 53 333 3333" }];
          case "tenant_integrations":
            return [
              { settings: { phone_number: "972544444444" } },
              { settings: null },
            ];
          default:
            return [];
        }
      });
      const keys = await loadStaffKeys(db, "t1");
      assertEquals([...keys].sort(), ["502222222", "533333333", "544444444"]);
      const roles = calls.find((c) => c.path === "user_roles");
      assertEquals(roles?.query.get("tenant_id"), "in.(t1,t2)");
    },
  );
});
