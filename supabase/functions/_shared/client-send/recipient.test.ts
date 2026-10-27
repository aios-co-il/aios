import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { CLIENT, guardDb, resolved, TENANT } from "./fake-guard-db.ts";
import { resolveRecipient, UNKNOWN_RECIPIENT } from "./recipient.ts";

/** An rpc that answers one result, for the resolver's failure modes. */
function answering(result: { data: unknown; error: unknown }) {
  return {
    rpc: () => ({ single: () => Promise.resolve(result) }),
  };
}

Deno.test("resolveRecipient asks the database", async (t) => {
  await t.step("with the sender's tenant and the address's shape", async () => {
    const { db, rpcCalls } = guardDb({
      recipient: resolved("client_group", [CLIENT], { group_id: "group-1" }),
    });
    const recipient = await resolveRecipient(db, {
      tenantId: TENANT,
      channel: "whatsapp",
      address: "120363416882903532@g.us",
    });
    assertEquals(rpcCalls, [
      {
        fn: "resolve_send_recipient",
        args: {
          p_tenant_id: TENANT,
          p_shape: "group",
          p_address: "120363416882903532@g.us",
        },
      },
    ]);
    assertEquals(recipient, {
      kind: "client_group",
      clientIds: [CLIENT],
      leadId: null,
      groupId: "group-1",
      ambiguous: false,
    });
  });

  await t.step("not for an address nothing can match", async () => {
    const { db, rpcCalls } = guardDb();
    const recipient = await resolveRecipient(db, {
      tenantId: TENANT,
      channel: "whatsapp",
      address: "123456789012@lid",
    });
    assertEquals(recipient, UNKNOWN_RECIPIENT);
    assertEquals(rpcCalls, []);
  });
});

Deno.test("resolveRecipient throws so the guard fails closed", async (t) => {
  const input = {
    tenantId: TENANT,
    channel: "whatsapp" as const,
    address: "972501234567",
  };

  await t.step("on a database error", async () => {
    const db = answering({ data: null, error: { message: "timeout" } });
    await assertRejects(() => resolveRecipient(db, input));
  });

  await t.step("on no row", async () => {
    const db = answering({ data: null, error: null });
    await assertRejects(() => resolveRecipient(db, input), Error, "no row");
  });

  await t.step("on a kind TypeScript does not know", async () => {
    const db = answering({
      data: { ...resolved("unknown"), recipient_kind: "vendor" },
      error: null,
    });
    await assertRejects(() => resolveRecipient(db, input), Error, "vendor");
  });
});
