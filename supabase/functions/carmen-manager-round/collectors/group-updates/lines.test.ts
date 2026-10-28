import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../../tests/recording-client.ts";
import { monitoredLineIds } from "./lines.ts";

Deno.test("monitoredLineIds", async (t) => {
  await t.step(
    "the owner level's own Green lines and org-wide lines; never a private line",
    async () => {
      const { db, calls } = recordingClient(({ path }) =>
        path === "user_roles"
          ? [{ user_id: "owner" }, { user_id: "agency-owner" }]
          : [
              { user_id: "owner", connection_visibility: "private" },
              { user_id: "agency-owner", connection_visibility: "private" },
              { user_id: "campaigner", connection_visibility: "private" },
              { user_id: "office", connection_visibility: "org" },
              { user_id: null, connection_visibility: "org" },
              { user_id: "owner", connection_visibility: "shared" },
            ],
      );
      assertEquals(await monitoredLineIds(db, "t1"), [
        "owner",
        "agency-owner",
        "office",
      ]);
      const lines = calls.find((c) => c.path === "tenant_integrations");
      assertEquals(
        [
          lines?.query.get("tenant_id"),
          lines?.query.get("integration_type"),
          lines?.query.get("is_active"),
        ],
        ["eq.t1", "eq.green_api", "eq.true"],
      );
      const roles = calls.find((c) => c.path === "user_roles");
      assertEquals(
        [roles?.query.get("tenant_id"), roles?.query.get("role")],
        ["eq.t1", "in.(owner,agency_owner)"],
      );
    },
  );
});
