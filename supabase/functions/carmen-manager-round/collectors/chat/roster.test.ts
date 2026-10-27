import { assertEquals } from "jsr:@std/assert@1";
import { NOW } from "../../tests/chat-fixtures.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadStaffKeys } from "./roster.ts";

const TENANTS = ["t1", "t2"];

Deno.test("loadStaffKeys", async (t) => {
  await t.step(
    "logins, campaigners, sales people and the tenants' own lines",
    async () => {
      const { db, calls } = recordingClient(({ path }) => {
        switch (path) {
          case "user_roles":
            return [{ user_id: "u1" }];
          case "tenant_users":
            return [{ user_id: "u1" }, { user_id: "u2" }];
          case "profiles":
            return [
              { id: "u1", phone: "+972-50-111-1111", campaigners: null },
              { id: "u2", phone: null, campaigners: { phone: "0502222222" } },
            ];
          case "campaigners":
            return [{ phone: "050-333-3333" }, { phone: null }];
          case "sales_people":
            return [{ phone: "0504444444" }];
          case "chat_messages":
            return { wid: "972506666666@c.us" };
          default:
            return [
              {
                tenant_id: "t1",
                user_id: null,
                integration_type: "manus_wa",
                settings: { phone_number: "972505555555" },
              },
              {
                tenant_id: "t2",
                user_id: "office",
                integration_type: "green_api",
                settings: {},
              },
            ];
        }
      });
      const keys = await loadStaffKeys(db, TENANTS, NOW);
      assertEquals([...keys].sort(), [
        "501111111",
        "502222222",
        "503333333",
        "504444444",
        "505555555",
        "506666666",
      ]);
      for (const table of [
        "user_roles",
        "tenant_users",
        "campaigners",
        "sales_people",
        "tenant_integrations",
      ]) {
        const call = calls.find((c) => c.path === table);
        assertEquals(call?.query.get("tenant_id"), "in.(t1,t2)", table);
      }
      const profiles = calls.find((c) => c.path === "profiles");
      assertEquals(profiles?.query.get("id"), "in.(u1,u2)");
      const wid = calls.find((c) => c.path === "chat_messages");
      assertEquals(
        [
          wid?.query.get("tenant_id"),
          wid?.query.get("connection_user_id"),
          wid?.query.get("created_at"),
        ],
        ["eq.t2", "eq.office", `gte.${NOW.toISOString()}`],
      );
    },
  );
});
