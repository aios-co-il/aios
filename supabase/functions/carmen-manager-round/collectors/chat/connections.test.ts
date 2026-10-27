import { assertEquals } from "jsr:@std/assert@1";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { monitoredConnectionIds, tenantSlug } from "./connections.ts";

Deno.test("monitoredConnectionIds", async (t) => {
  await t.step(
    "the owners' own Green lines and org-wide lines only",
    async () => {
      const { db, calls } = recordingClient(({ path }) =>
        path === "user_roles"
          ? [{ user_id: "owner" }]
          : [
              { user_id: "owner", connection_visibility: "private" },
              { user_id: "campaigner", connection_visibility: "private" },
              { user_id: "office", connection_visibility: "org" },
              { user_id: null, connection_visibility: "org" },
              { user_id: "owner", connection_visibility: "shared" },
            ],
      );
      assertEquals(await monitoredConnectionIds(db, TENANT), [
        "owner",
        "office",
      ]);
      const lines = calls.find((c) => c.path === "tenant_integrations");
      assertEquals(
        [
          lines?.query.get("tenant_id"),
          lines?.query.get("integration_type"),
          lines?.query.get("is_active"),
        ],
        [`eq.${TENANT}`, "eq.green_api", "eq.true"],
      );
      const roles = calls.find((c) => c.path === "user_roles");
      assertEquals(
        [roles?.query.get("tenant_id"), roles?.query.get("role")],
        [`eq.${TENANT}`, "eq.owner"],
      );
    },
  );
});

Deno.test("tenantSlug", async (t) => {
  await t.step("reads the tenant's own slug", async () => {
    const { db, calls } = recordingClient(() => ({ slug: "acme" }));
    assertEquals(await tenantSlug(db, TENANT), "acme");
    assertEquals(calls[0].query.get("id"), `eq.${TENANT}`);
  });
});
