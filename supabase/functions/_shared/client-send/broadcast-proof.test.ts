import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { sendingBroadcast } from "./broadcast-proof.ts";
import { guardDb, OTHER_TENANT, TENANT } from "./fake-guard-db.ts";

const BROADCAST = "66666666-6666-4666-8666-666666666666";
const STREAM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTOMATION = "77777777-7777-4777-8777-777777777777";
const GROUP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE_CHAT = "972501234567@c.us";

const { db, rpcCalls, writes } = guardDb({
  tables: {
    broadcasts: [
      {
        id: BROADCAST,
        tenant_id: TENANT,
        status: "sending",
        origin: "manual",
        automation_id: null,
      },
      {
        id: STREAM,
        tenant_id: TENANT,
        status: "sending",
        origin: "automation",
        automation_id: AUTOMATION,
      },
    ],
    broadcast_recipients: [
      { broadcast_id: BROADCAST, tenant_id: TENANT, address: "972501234567" },
      { broadcast_id: BROADCAST, tenant_id: TENANT, group_id: GROUP },
      { broadcast_id: STREAM, tenant_id: TENANT, address: "972501234567" },
    ],
  },
});

/** Whether the broadcast proves a WhatsApp send to this address. */
const ask = (
  broadcastId: string,
  address = PHONE_CHAT,
  fields: { tenantId?: string; groupId?: string | null } = {},
) =>
  sendingBroadcast(db, {
    tenantId: TENANT,
    broadcastId,
    channel: "whatsapp",
    address,
    groupId: null,
    ...fields,
  });

Deno.test("sendingBroadcast proves a broadcast being dispatched", async (t) => {
  await t.step("to a listed phone, asked by its match key", async () => {
    assertEquals(await ask(BROADCAST), { automationStream: false });
    assertEquals(rpcCalls.at(-1), {
      fn: "broadcast_lists_recipient",
      args: {
        p_tenant_id: TENANT,
        p_broadcast_id: BROADCAST,
        p_shape: "phone",
        p_address: "972501234567",
      },
    });
  });

  await t.step("to a listed group, by the row the sender read", async () => {
    assertEquals(
      await ask(BROADCAST, "120363000000000000@g.us", { groupId: GROUP }),
      { automationStream: false },
    );
  });

  await t.step("an automation's stream, with its automation", async () => {
    assertEquals(await ask(STREAM), {
      automationStream: true,
      automationId: AUTOMATION,
    });
  });

  await t.step("not to an address it does not list", async () => {
    assertEquals(await ask(BROADCAST, "972509999999@c.us"), null);
    assertEquals(await ask(BROADCAST, "123456789012@lid"), null);
  });

  await t.step("not another tenant's, nor a non-uuid ref", async () => {
    assertEquals(
      await ask(BROADCAST, PHONE_CHAT, { tenantId: OTHER_TENANT }),
      null,
    );
    assertEquals(await ask("draft"), null);
  });

  await t.step("not a paused one", async () => {
    const paused = guardDb({
      tables: {
        broadcasts: [{ id: BROADCAST, tenant_id: TENANT, status: "paused" }],
        broadcast_recipients: [
          {
            broadcast_id: BROADCAST,
            tenant_id: TENANT,
            address: "972501234567",
          },
        ],
      },
    });
    assertEquals(
      await sendingBroadcast(paused.db, {
        tenantId: TENANT,
        broadcastId: BROADCAST,
        channel: "whatsapp",
        address: PHONE_CHAT,
        groupId: null,
      }),
      null,
    );
  });

  assertEquals(writes, []);
});

Deno.test("sendingBroadcast throws on a database error", async () => {
  // The guard turns the throw into guard_error: it fails closed.
  for (const failing of ["broadcasts", "broadcast_lists_recipient"]) {
    const down = guardDb({
      failing: [failing],
      tables: {
        broadcasts: [
          {
            id: BROADCAST,
            tenant_id: TENANT,
            status: "sending",
            origin: "manual",
          },
        ],
      },
    });
    await assertRejects(() =>
      sendingBroadcast(down.db, {
        tenantId: TENANT,
        broadcastId: BROADCAST,
        channel: "whatsapp",
        address: PHONE_CHAT,
        groupId: null,
      }),
    );
  }
});
