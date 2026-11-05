import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSystemSendDb } from "../_shared/client-card/fake-system-send-db.ts";
import { recordAutomationStepSend } from "./step-client-send.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";

const clientRow = { id: CLIENT, tenant_id: TENANT, phone: "050-123-4567" };

const baseSend = {
  tenantId: TENANT,
  message: "שלום, הדוח החודשי מוכן",
  provider: "green_api" as const,
  connectionUserId: OWNER,
  integrationId: "integration-1",
  providerResponse: { idMessage: "BAE5F1" },
};

Deno.test(
  "a send to the client's phone is recorded with the client",
  async () => {
    const db = fakeSystemSendDb({ clients: [clientRow] });
    const outcome = await recordAutomationStepSend(db, {
      ...baseSend,
      chatId: "972501234567@c.us",
      data: { client_id: CLIENT, id: LEAD },
      contact: { id: LEAD },
    });
    assertStrictEquals(outcome, "recorded");
    assertStrictEquals(db.inserts.length, 1);
    assertStrictEquals(db.inserts[0].table, "chat_messages");
    assertStrictEquals(db.inserts[0].row.client_id, CLIENT);
    assertStrictEquals(db.inserts[0].row.send_kind, "automation");
    assertEquals(db.rpcs[0], {
      fn: "client_card_logs_system_sends",
      args: { p_tenant: TENANT },
    });
  },
);

Deno.test(
  "a multi-recipient send finds the client its contact_lookup names",
  async () => {
    const db = fakeSystemSendDb({ clients: [clientRow] });
    assertStrictEquals(
      await recordAutomationStepSend(db, {
        ...baseSend,
        chatId: "972501234567@c.us",
        data: null,
        recipients: [
          { type: "contact_lookup", entity: "client", id: CLIENT },
          { type: "contact_lookup", entity: "lead", id: LEAD },
        ],
      }),
      "recorded",
    );
    assertStrictEquals(db.inserts[0].row.client_id, CLIENT);
    // A recipient list that names no client finds nobody for that phone.
    assertStrictEquals(
      await recordAutomationStepSend(db, {
        ...baseSend,
        chatId: "972501234567@c.us",
        data: null,
        recipients: [{ type: "contact_lookup", entity: "lead", id: LEAD }],
      }),
      "not_client",
    );
  },
);

Deno.test(
  "lead, team member and manual-number sends write no row and no stamp",
  async () => {
    const db = fakeSystemSendDb({ clients: [clientRow] });
    for (const chatId of ["972541112233@c.us", "972529998877@c.us"]) {
      assertStrictEquals(
        await recordAutomationStepSend(db, {
          ...baseSend,
          chatId,
          data: { client_id: CLIENT, id: LEAD },
        }),
        "not_client",
        chatId,
      );
    }
    assertEquals(db.inserts, []);
  },
);

Deno.test(
  "nothing is recorded while the tenant's card logging is off",
  async () => {
    for (const loggingOn of [false, null, "true"]) {
      const db = fakeSystemSendDb({ clients: [clientRow], loggingOn });
      assertStrictEquals(
        await recordAutomationStepSend(db, {
          ...baseSend,
          chatId: "972501234567@c.us",
          data: { client_id: CLIENT },
        }),
        "logging_off",
      );
      assertEquals(db.inserts, []);
      assertEquals(db.queries, []);
    }
  },
);

Deno.test(
  "external credentials (no connection owner) are skipped without a lookup",
  async () => {
    const db = fakeSystemSendDb({ clients: [clientRow] });
    assertStrictEquals(
      await recordAutomationStepSend(db, {
        ...baseSend,
        connectionUserId: null,
        chatId: "972501234567@c.us",
        data: { client_id: CLIENT },
      }),
      "skipped",
    );
    assertEquals(db.rpcs, []);
  },
);

Deno.test(
  "a failed insert or lookup never throws: the message was sent",
  async () => {
    const failing = fakeSystemSendDb({
      clients: [clientRow],
      insertError: { code: "42501" },
    });
    assertStrictEquals(
      await recordAutomationStepSend(failing, {
        ...baseSend,
        chatId: "972501234567@c.us",
        data: { client_id: CLIENT },
      }),
      "failed",
    );
    const throwing = fakeSystemSendDb({
      clients: [clientRow],
      throwOn: "chat_messages",
    });
    assertStrictEquals(
      await recordAutomationStepSend(throwing, {
        ...baseSend,
        chatId: "972501234567@c.us",
        data: { client_id: CLIENT },
      }),
      "failed",
    );
  },
);
