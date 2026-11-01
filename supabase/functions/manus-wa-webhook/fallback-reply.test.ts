import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSystemSendDb } from "../_shared/client-card/fake-system-send-db.ts";
import { readJsonWithin, recordManusFallbackReply } from "./fallback-reply.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const OWNER = "44444444-4444-4444-8444-444444444444";
const GROUP = "66666666-6666-4666-8666-666666666666";

/** A tenant whose group 120363@g.us belongs to one client. */
function clientGroupDb() {
  return fakeSystemSendDb({
    whatsapp_groups: [
      { id: GROUP, tenant_id: TENANT, group_chat_id: "120363@g.us" },
    ],
    groupClient: { [GROUP]: CLIENT },
  });
}

/** Carmen's fallback reply in that group. */
function reply(db: ReturnType<typeof fakeSystemSendDb>) {
  return {
    db,
    tenantId: TENANT,
    chatId: "120363@g.us",
    message: "כרמן: הקמפיין עודכן",
    connectionUserId: OWNER,
    integrationId: "manus-1",
  };
}

Deno.test(
  "a group reply the gateway accepted is recorded as Carmen's",
  async () => {
    const db = clientGroupDb();
    await recordManusFallbackReply(
      Response.json({ success: true, messageId: "m-1" }),
      reply(db),
    );
    assertStrictEquals(db.inserts.length, 1);
    assertStrictEquals(db.inserts[0].row.send_kind, "carmen");
    assertStrictEquals(db.inserts[0].row.provider, "manus_wa");
    assertStrictEquals(db.inserts[0].row.group_id, GROUP);
    assertStrictEquals(db.inserts[0].row.integration_id, "manus-1");
    assertEquals(db.inserts[0].row.raw_provider_data, {
      success: true,
      messageId: "m-1",
      carmen: true,
    });
  },
);

Deno.test(
  "a reply the gateway rejected or failed records nothing",
  async () => {
    const rejected = clientGroupDb();
    await recordManusFallbackReply(
      Response.json({ success: false, error: "not in group" }),
      reply(rejected),
    );
    assertEquals(rejected.inserts, []);
    assertEquals(rejected.rpcs, []);
    const failed = clientGroupDb();
    await recordManusFallbackReply(
      new Response("bad gateway", { status: 502 }),
      reply(failed),
    );
    assertEquals(failed.rpcs, []);
  },
);

Deno.test(
  "an unreadable gateway response still records the reply that went out",
  async () => {
    const db = clientGroupDb();
    await recordManusFallbackReply(new Response("<html>ok</html>"), reply(db));
    assertStrictEquals(db.inserts.length, 1);
    assertEquals(db.inserts[0].row.raw_provider_data, { carmen: true });
  },
);

Deno.test("the response body is read for a bounded time only", async () => {
  assertEquals(await readJsonWithin(Response.json({ ok: 1 }), 1000), {
    ok: 1,
  });
  let close = () => {};
  const stalled = new ReadableStream({
    start(controller) {
      close = () => controller.close();
    },
  });
  const started = Date.now();
  assertStrictEquals(await readJsonWithin(new Response(stalled), 20), null);
  assertStrictEquals(Date.now() - started < 1000, true);
  close();
});
