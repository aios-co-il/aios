import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSystemSendDb } from "./fake-system-send-db.ts";
import {
  automationChatRow,
  findAutomationClientGroup,
  recordAutomationClientSend,
  recordCarmenFallbackGroupReply,
} from "./system-send.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "11111111-1111-4111-8111-222222222222";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const OWNER = "44444444-4444-4444-8444-444444444444";
const GROUP = "66666666-6666-4666-8666-666666666666";

const baseSend = {
  tenantId: TENANT,
  message: "שלום, הדוח החודשי מוכן",
  provider: "green_api" as const,
  connectionUserId: OWNER,
  integrationId: "integration-1",
  providerResponse: { idMessage: "BAE5F1" },
};

const groups = [
  { id: GROUP, tenant_id: TENANT, group_chat_id: "120363@g.us" },
  { id: "staff-group", tenant_id: TENANT, group_chat_id: "777@g.us" },
];

Deno.test(
  "the chat row is an outbound automation send with the provider id",
  () => {
    const row = automationChatRow(
      { ...baseSend, chatId: "972501234567@c.us" },
      { clientId: CLIENT, groupId: null },
    );
    assertEquals(row, {
      tenant_id: TENANT,
      client_id: CLIENT,
      group_id: null,
      connection_user_id: OWNER,
      integration_id: "integration-1",
      sent_by_user_id: OWNER,
      message_text: "שלום, הדוח החודשי מוכן",
      direction: "outbound",
      channel: "whatsapp",
      provider: "green_api",
      sender_phone: "972501234567",
      // idMessage stays top level, so the webhook echo is a duplicate; the
      // echo still owes the team-channel mirror.
      raw_provider_data: {
        idMessage: "BAE5F1",
        automation: true,
        team_forward: "pending",
      },
      send_kind: "automation",
    });
    const groupRow = automationChatRow(
      {
        ...baseSend,
        provider: "manus_wa",
        chatId: "120363@g.us",
        providerResponse: null,
      },
      { clientId: null, groupId: GROUP },
    );
    assertStrictEquals(groupRow.client_id, null);
    assertStrictEquals(groupRow.group_id, GROUP);
    assertStrictEquals(groupRow.sender_phone, null);
    assertStrictEquals(groupRow.provider, "manus_wa");
    // No Green API echo comes back for Manus, so no mirror is owed.
    assertEquals(groupRow.raw_provider_data, { automation: true });
    const carmenRow = automationChatRow(
      { ...baseSend, chatId: "120363@g.us", sendKind: "carmen" },
      { clientId: null, groupId: GROUP },
    );
    assertStrictEquals(carmenRow.send_kind, "carmen");
    assertEquals(carmenRow.raw_provider_data, {
      idMessage: "BAE5F1",
      carmen: true,
      team_forward: "pending",
    });
  },
);

Deno.test("only a group chat id is looked up as a client group", async () => {
  const db = fakeSystemSendDb({
    whatsapp_groups: groups,
    groupClient: { [GROUP]: CLIENT },
  });
  for (const chatId of ["972501234567@c.us", "0501234567", ""]) {
    assertStrictEquals(
      await findAutomationClientGroup(db, { tenantId: TENANT, chatId }),
      null,
      chatId,
    );
  }
  assertEquals(db.queries, []);
  assertStrictEquals(
    await findAutomationClientGroup(db, {
      tenantId: TENANT,
      chatId: "120363@g.us",
    }),
    GROUP,
  );
});

Deno.test(
  "a group send is recorded only when the group belongs to one client",
  async () => {
    const db = fakeSystemSendDb({
      whatsapp_groups: groups,
      groupClient: { [GROUP]: CLIENT, "staff-group": null },
    });
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        chatId: "120363@g.us",
      }),
      "recorded",
    );
    assertStrictEquals(db.inserts[0].row.group_id, GROUP);
    assertStrictEquals(db.inserts[0].row.client_id, null);
    // A staff group (or an ambiguous one) resolves to no client.
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        chatId: "777@g.us",
        findClientRecipient: () => Promise.resolve(null),
      }),
      "not_client",
    );
    // An unknown group or another tenant's group is not looked up further.
    assertStrictEquals(
      await findAutomationClientGroup(db, {
        tenantId: OTHER_TENANT,
        chatId: "120363@g.us",
      }),
      null,
    );
    assertStrictEquals(db.inserts.length, 1);
  },
);

Deno.test(
  "a 1:1 send is recorded with the client findClientRecipient names",
  async () => {
    const db = fakeSystemSendDb({});
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        chatId: "972501234567@c.us",
        findClientRecipient: () => Promise.resolve(CLIENT),
      }),
      "recorded",
    );
    assertStrictEquals(db.inserts[0].row.client_id, CLIENT);
    assertStrictEquals(db.inserts[0].row.send_kind, "automation");
    // Without a finder, a private chat is never a client.
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        chatId: "972501234567@c.us",
      }),
      "not_client",
    );
    assertStrictEquals(db.inserts.length, 1);
  },
);

Deno.test(
  "a failed switch lookup counts as logging off and looks nothing up",
  async () => {
    const db = fakeSystemSendDb({
      whatsapp_groups: groups,
      groupClient: { [GROUP]: CLIENT },
      flagError: { code: "57014" },
    });
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        chatId: "120363@g.us",
      }),
      "logging_off",
    );
    assertEquals(db.queries, []);
    assertEquals(db.inserts, []);
  },
);

Deno.test(
  "a Carmen fallback reply is recorded only in a group of one client",
  async () => {
    const db = fakeSystemSendDb({
      whatsapp_groups: groups,
      groupClient: { [GROUP]: CLIENT, "staff-group": null },
    });
    const reply = { ...baseSend, message: "כרמן: הקמפיין עודכן" };
    assertStrictEquals(
      await recordCarmenFallbackGroupReply(db, {
        ...reply,
        chatId: "120363@g.us",
      }),
      "recorded",
    );
    assertStrictEquals(db.inserts.length, 1);
    assertStrictEquals(db.inserts[0].row.send_kind, "carmen");
    assertStrictEquals(db.inserts[0].row.group_id, GROUP);
    assertEquals(db.inserts[0].row.raw_provider_data, {
      idMessage: "BAE5F1",
      carmen: true,
      team_forward: "pending",
    });
    // A staff group, and a private chat (even the client's own phone), are
    // never logged, like a reply through the action step.
    assertStrictEquals(
      await recordCarmenFallbackGroupReply(db, {
        ...reply,
        chatId: "777@g.us",
      }),
      "not_client",
    );
    const rpcsBefore = db.rpcs.length;
    assertStrictEquals(
      await recordCarmenFallbackGroupReply(db, {
        ...reply,
        chatId: "972501234567@c.us",
      }),
      "not_client",
    );
    assertStrictEquals(db.rpcs.length, rpcsBefore, "no lookup for a DM");
    assertStrictEquals(db.inserts.length, 1);
    // The same opt-in switch as every other card entry.
    const off = fakeSystemSendDb({
      whatsapp_groups: groups,
      groupClient: { [GROUP]: CLIENT },
      loggingOn: false,
    });
    assertStrictEquals(
      await recordCarmenFallbackGroupReply(off, {
        ...reply,
        chatId: "120363@g.us",
      }),
      "logging_off",
    );
    assertEquals(off.inserts, []);
    // Manus: no Green API echo, so no mirror is owed.
    const manus = fakeSystemSendDb({
      whatsapp_groups: groups,
      groupClient: { [GROUP]: CLIENT },
    });
    await recordCarmenFallbackGroupReply(manus, {
      ...reply,
      provider: "manus_wa",
      providerResponse: { success: true, messageId: "m-1" },
      chatId: "120363@g.us",
    });
    assertEquals(manus.inserts[0].row.raw_provider_data, {
      success: true,
      messageId: "m-1",
      carmen: true,
    });
  },
);
