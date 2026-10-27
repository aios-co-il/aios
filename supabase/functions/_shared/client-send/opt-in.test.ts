import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { CLIENT, guardDb, optInKey, TENANT } from "./fake-guard-db.ts";
import { isOptedIn } from "./opt-in.ts";

const input = {
  tenantId: TENANT,
  clientId: CLIENT,
  kind: "lead_alert" as const,
  target: "whatsapp_group" as const,
};

Deno.test("isOptedIn asks client_auto_send_allowed", async (t) => {
  await t.step(
    "with the sender's tenant, client, kind and target",
    async () => {
      const { db, rpcCalls } = guardDb({
        optIns: [optInKey(CLIENT, "lead_alert", "whatsapp_group")],
      });
      assertEquals(await isOptedIn(db, input), true);
      assertEquals(rpcCalls, [
        {
          fn: "client_auto_send_allowed",
          args: {
            p_tenant_id: TENANT,
            p_client_id: CLIENT,
            p_kind: "lead_alert",
            p_target: "whatsapp_group",
          },
        },
      ]);
    },
  );

  await t.step("a switch for another target does not count", async () => {
    const { db } = guardDb({
      optIns: [optInKey(CLIENT, "lead_alert", "whatsapp_direct")],
    });
    assertEquals(await isOptedIn(db, input), false);
  });

  await t.step("a database error throws", async () => {
    const { db } = guardDb({ failing: ["client_auto_send_allowed"] });
    await assertRejects(() => isOptedIn(db, input));
  });
});
