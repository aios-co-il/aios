import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  automationCandidateClientIds,
  automationChatRow,
  findAutomationClientGroup,
  findAutomationClientRecipient,
  isGroupChatId,
  matchClientByPhone,
  recipientClientIds,
  recordAutomationClientSend,
} from "./automation-client-send.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "11111111-1111-4111-8111-222222222222";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const CLIENT_B = "22222222-2222-4222-8222-333333333333";
const LEAD = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";
const GROUP = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;

/** A PostgREST stand-in: filters rows by eq/in and records inserts and RPCs. */
function fakeDb(seed: {
  clients?: Row[];
  whatsapp_groups?: Row[];
  loggingOn?: unknown;
  groupClient?: Record<string, string | null>;
  insertError?: unknown;
  throwOn?: string;
}) {
  const inserts: Array<{ table: string; row: Row }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const queries: string[] = [];
  const tables: Record<string, Row[]> = {
    clients: seed.clients ?? [],
    whatsapp_groups: seed.whatsapp_groups ?? [],
  };
  function builder(table: string) {
    if (seed.throwOn === table) throw new Error(`boom ${table}`);
    queries.push(table);
    let rows = [...(tables[table] ?? [])];
    const result = () => Promise.resolve({ data: rows, error: null });
    const b = {
      select: () => b,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return b;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return b;
      },
      limit: () => b,
      maybeSingle: () =>
        Promise.resolve({ data: rows[0] ?? null, error: null }),
      insert: (row: Row) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: seed.insertError ?? null });
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => result().then(resolve, reject),
    };
    return b;
  }
  return {
    inserts,
    rpcs,
    queries,
    from: builder,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn === "client_card_logs_system_sends")
        return Promise.resolve({
          data: "loggingOn" in seed ? seed.loggingOn : true,
          error: null,
        });
      if (fn === "resolve_whatsapp_group_client")
        return Promise.resolve({
          data: seed.groupClient?.[String(args.p_group)] ?? null,
          error: null,
        });
      return Promise.resolve({ data: null, error: { message: "unknown" } });
    },
  };
}

const clientRow = { id: CLIENT, tenant_id: TENANT, phone: "050-123-4567" };

const baseSend = {
  tenantId: TENANT,
  message: "שלום, הדוח החודשי מוכן",
  provider: "green_api" as const,
  connectionUserId: OWNER,
  integrationId: "integration-1",
  providerResponse: { idMessage: "BAE5F1" },
};

// ─── Pure helpers ───────────────────────────────────────────────────────────

Deno.test("group chat ids are recognised", () => {
  assertStrictEquals(isGroupChatId("120363416882903532@g.us"), true);
  assertStrictEquals(isGroupChatId("972501234567@c.us"), false);
  assertStrictEquals(isGroupChatId("0501234567"), false);
  assertStrictEquals(isGroupChatId(null), false);
});

Deno.test("candidate client ids are distinct non-empty strings", () => {
  assertEquals(
    automationCandidateClientIds([CLIENT, null, "", " ", CLIENT, 7, LEAD]),
    [CLIENT, LEAD],
  );
  assertEquals(
    recipientClientIds([
      { type: "contact_lookup", entity: "client", id: CLIENT },
      { type: "contact_lookup", entity: "lead", id: LEAD },
      { type: "phone_field", field: "client_phone" },
      null,
    ]),
    [CLIENT],
  );
  assertEquals(recipientClientIds("nope"), []);
});

Deno.test(
  "a destination matches the one client whose phone it is, in any format",
  () => {
    const clients = [clientRow, { id: CLIENT_B, phone: "052-9999999" }];
    for (const destination of [
      "972501234567@c.us",
      "972501234567",
      "+972 50-123-4567",
      "0501234567",
    ])
      assertStrictEquals(
        matchClientByPhone(destination, clients),
        CLIENT,
        destination,
      );
    // A lead's or a team member's phone is not the client.
    assertStrictEquals(matchClientByPhone("972541112233", clients), null);
    // A group is never matched by phone; an unusable number neither.
    assertStrictEquals(matchClientByPhone("123@g.us", clients), null);
    assertStrictEquals(matchClientByPhone("12", clients), null);
    // Two clients with the same phone: ambiguous, not logged.
    assertStrictEquals(
      matchClientByPhone("0501234567", [
        clientRow,
        { id: CLIENT_B, phone: "+972501234567" },
      ]),
      null,
    );
  },
);

Deno.test(
  "the chat row is an outbound automation send with the provider id",
  () => {
    const row = automationChatRow(
      { ...baseSend, chatId: "972501234567@c.us", candidateClientIds: [] },
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
      // idMessage stays top level, so the webhook echo is a duplicate.
      raw_provider_data: { idMessage: "BAE5F1", automation: true },
      send_kind: "automation",
    });
    const groupRow = automationChatRow(
      {
        ...baseSend,
        provider: "manus_wa",
        chatId: "120363@g.us",
        providerResponse: null,
        candidateClientIds: [],
      },
      { clientId: null, groupId: GROUP },
    );
    assertStrictEquals(groupRow.client_id, null);
    assertStrictEquals(groupRow.group_id, GROUP);
    assertStrictEquals(groupRow.sender_phone, null);
    assertStrictEquals(groupRow.provider, "manus_wa");
    assertEquals(groupRow.raw_provider_data, { automation: true });
  },
);

// ─── The Meta step's stamp ──────────────────────────────────────────────────

Deno.test(
  "a lead-directed send is not the client, though the payload names the client",
  async () => {
    // lead_created payload: client_id is the routed client, phone is the lead's.
    const db = fakeDb({ clients: [clientRow] });
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972541112233",
        candidateClientIds: [CLIENT],
      }),
      null,
    );
    // A lead→client alert goes to the client's own phone.
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [CLIENT],
      }),
      CLIENT,
    );
  },
);

Deno.test(
  "a client of another tenant, or no candidate, is never looked up as the recipient",
  async () => {
    const db = fakeDb({ clients: [{ ...clientRow, tenant_id: OTHER_TENANT }] });
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [CLIENT],
      }),
      null,
    );
    const empty = fakeDb({ clients: [clientRow] });
    assertStrictEquals(
      await findAutomationClientRecipient(empty, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [null, ""],
      }),
      null,
    );
    assertEquals(empty.queries, []);
  },
);

// ─── Green API / Manus steps: the recorded row ──────────────────────────────

Deno.test(
  "a send to the client's phone is recorded with the client",
  async () => {
    const db = fakeDb({ clients: [clientRow] });
    const outcome = await recordAutomationClientSend(db, {
      ...baseSend,
      chatId: "972501234567@c.us",
      candidateClientIds: [LEAD, CLIENT, null],
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
  "lead, team member and manual-number sends write no row and no stamp",
  async () => {
    const db = fakeDb({ clients: [clientRow] });
    for (const chatId of ["972541112233@c.us", "972529998877@c.us"])
      assertStrictEquals(
        await recordAutomationClientSend(db, {
          ...baseSend,
          chatId,
          candidateClientIds: [CLIENT, LEAD],
        }),
        "not_client",
        chatId,
      );
    assertEquals(db.inserts, []);
  },
);

Deno.test(
  "a group send is recorded only when the group belongs to one client",
  async () => {
    const groups = [
      { id: GROUP, tenant_id: TENANT, group_chat_id: "120363@g.us" },
      { id: "staff-group", tenant_id: TENANT, group_chat_id: "777@g.us" },
    ];
    const db = fakeDb({
      whatsapp_groups: groups,
      groupClient: { [GROUP]: CLIENT, "staff-group": null },
    });
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        chatId: "120363@g.us",
        candidateClientIds: [],
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
        candidateClientIds: [CLIENT],
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
  "nothing is recorded while the tenant's card logging is off",
  async () => {
    for (const loggingOn of [false, null, "true"]) {
      const db = fakeDb({ clients: [clientRow], loggingOn });
      assertStrictEquals(
        await recordAutomationClientSend(db, {
          ...baseSend,
          chatId: "972501234567@c.us",
          candidateClientIds: [CLIENT],
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
    const db = fakeDb({ clients: [clientRow] });
    assertStrictEquals(
      await recordAutomationClientSend(db, {
        ...baseSend,
        connectionUserId: null,
        chatId: "972501234567@c.us",
        candidateClientIds: [CLIENT],
      }),
      "skipped",
    );
    assertEquals(db.rpcs, []);
  },
);

Deno.test(
  "a failed insert or lookup never throws: the message was sent",
  async () => {
    const failing = fakeDb({
      clients: [clientRow],
      insertError: { code: "42501" },
    });
    assertStrictEquals(
      await recordAutomationClientSend(failing, {
        ...baseSend,
        chatId: "972501234567@c.us",
        candidateClientIds: [CLIENT],
      }),
      "failed",
    );
    const throwing = fakeDb({ clients: [clientRow], throwOn: "chat_messages" });
    assertStrictEquals(
      await recordAutomationClientSend(throwing, {
        ...baseSend,
        chatId: "972501234567@c.us",
        candidateClientIds: [CLIENT],
      }),
      "failed",
    );
  },
);

// ─── trigger-automation wiring ──────────────────────────────────────────────

const TRIGGER = Deno.readTextFileSync(
  new URL("../trigger-automation/index.ts", import.meta.url),
);

function functionSource(name: string): string {
  const start = TRIGGER.indexOf(`async function ${name}(`);
  assert(start >= 0, name);
  const next = TRIGGER.indexOf("\nasync function ", start + 1);
  return TRIGGER.slice(start, next < 0 ? undefined : next);
}

Deno.test(
  "the Meta step stamps automation only for a send to the client's own phone",
  () => {
    const meta = functionSource("executeMetaWhatsappMessage");
    assertMatch(
      meta,
      /findAutomationClientRecipient\(supabase, \{\s+tenantId,\s+destination: phoneNumber,\s+candidateClientIds: \[data\?\.client_id\],\s+\}\)/,
    );
    assertMatch(
      meta,
      /\.\.\.\(clientRecipientId \? \{ sendKind: "automation" \} : \{\}\)/,
    );
    // No unconditional stamp is left anywhere in trigger-automation.
    assertNotMatch(TRIGGER, /^\s*sendKind: "automation",?$/m);
  },
);

Deno.test(
  "the Green API / Manus step records every successful send, single and multi-recipient",
  () => {
    const green = functionSource("executeGreenApiMessage");
    const calls = green.match(
      /await recordAutomationClientSend\(supabase, \{/g,
    );
    assertStrictEquals(calls?.length, 2);
    assertMatch(
      green,
      /candidateClientIds: \[contactRecord\?\.id, data\?\.client_id, data\?\.id\]/,
    );
    assertMatch(green, /\.\.\.recipientClientIds\(config\.recipients\)/);
    // Recorded after the send succeeded, never for a skipped duplicate.
    const multi = green.slice(green.indexOf('status: "sent", result: r'));
    assert(multi.indexOf("recordAutomationClientSend") > 0);
    assert(
      green.lastIndexOf("recordAutomationClientSend") >
        green.lastIndexOf("throw sendErr;"),
    );
    // The integration owner is the connection user of the recorded row.
    const resolve = functionSource("resolveWaIntegration");
    assertMatch(resolve, /connectionUserId: \(integration\.user_id/);
    assertMatch(resolve, /connectionUserId: null,\s+integrationId: null,/);
  },
);
