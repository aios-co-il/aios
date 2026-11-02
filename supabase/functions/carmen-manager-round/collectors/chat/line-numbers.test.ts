import { assertEquals } from "jsr:@std/assert@1";
import { NOW } from "../../tests/chat-fixtures.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { linePhones } from "./line-numbers.ts";

Deno.test("linePhones", async (t) => {
  await t.step(
    "stored numbers, and each Green line's own number from its rows",
    async () => {
      const { db, calls } = recordingClient(({ path }) =>
        path === "chat_messages"
          ? { wid: "972506666666@c.us" }
          : [
              {
                tenant_id: "t1",
                user_id: null,
                integration_type: "manus_wa",
                settings: { phone_number: 972505555555 },
              },
              {
                tenant_id: "t2",
                user_id: "office",
                integration_type: "green_api",
                settings: { phone_number: "0507777777" },
              },
              {
                tenant_id: "t2",
                user_id: null,
                integration_type: "green_api",
                settings: [],
              },
            ],
      );
      assertEquals(await linePhones(db, ["t1", "t2"], NOW), [
        { tenantId: "t1", phone: "972505555555" },
        { tenantId: "t2", phone: "0507777777" },
        { tenantId: "t2", phone: "972506666666" },
      ]);
      const lines = calls.find((c) => c.path === "tenant_integrations");
      assertEquals(
        [lines?.query.get("tenant_id"), lines?.query.get("integration_type")],
        ["in.(t1,t2)", "in.(manus_wa,green_api)"],
      );
      const wids = calls.filter((c) => c.path === "chat_messages");
      assertEquals(
        wids.map((c) => [
          c.query.get("tenant_id"),
          c.query.get("provider"),
          c.query.get("connection_user_id"),
        ]),
        [["eq.t2", "eq.green_api", "eq.office"]],
      );
    },
  );
});
