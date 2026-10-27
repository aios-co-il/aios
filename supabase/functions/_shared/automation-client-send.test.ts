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
  claimStoredSendTeamForward,
  findAutomationClientGroup,
  findAutomationClientRecipient,
  isGroupChatId,
  matchClientByPhone,
  recipientClientIds,
  recordAutomationClientSend,
  recordCarmenFallbackGroupReply,
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
        candidateClientIds: [],
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
      {
        ...baseSend,
        chatId: "120363@g.us",
        candidateClientIds: [],
        sendKind: "carmen",
      },
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
    // Like the Green API / Manus step: data.client_id, then data.id when the
    // payload is the client row (never the id already sent as the lead).
    assertMatch(
      meta,
      /findAutomationClientRecipient\(supabase, \{\s+tenantId,\s+destination: phoneNumber,\s+candidateClientIds: \[\s+data\?\.client_id,\s+leadId === data\?\.id \? null : data\?\.id,\s+\],\s+\}\)/,
    );
    assertMatch(
      meta,
      /const leadId = sendingToClient\s+\? data\?\.lead_id \|\| null\s+: data\?\.lead_id \|\| data\?\.id \|\| null;/,
    );
    // The row is attached to the client the message reached.
    assertMatch(
      meta,
      /clientId: clientRecipientId \|\| data\?\.client_id \|\| null,/,
    );
    assertMatch(meta, /^\s+leadId,$/m);
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

Deno.test(
  "a Meta send for a client-row payload resolves the client through data.id",
  async () => {
    // client_status_changed and similar payloads are the client row itself.
    const db = fakeDb({ clients: [clientRow] });
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [undefined, CLIENT],
      }),
      CLIENT,
    );
    // A lead payload's data.id is a lead: never a client.
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [undefined, LEAD],
      }),
      null,
    );
  },
);

// ─── Carmen's webhook-fallback replies ──────────────────────────────────────

Deno.test(
  "a Carmen fallback reply is recorded only in a group of one client",
  async () => {
    const groups = [
      { id: GROUP, tenant_id: TENANT, group_chat_id: "120363@g.us" },
      { id: "staff-group", tenant_id: TENANT, group_chat_id: "777@g.us" },
    ];
    const db = fakeDb({
      clients: [clientRow],
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
    const off = fakeDb({
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
    const manus = fakeDb({
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

// ─── The Green API echo and the team-channel mirror ─────────────────────────

/**
 * chat_messages as PostgREST sees it: eq filters on columns and on
 * raw_provider_data->>key paths, and a conditional update that returns the
 * rows it changed. Each call resolves on a later microtask, so concurrent
 * claims interleave like two webhook deliveries.
 */
function fakeChatMessages(
  seed: Row[],
  opts: { selectError?: unknown; updateError?: unknown } = {},
) {
  const rows = seed.map((row) => structuredClone(row));
  const updates: Row[] = [];
  const value = (row: Row, column: string) => {
    const path = column.match(/^raw_provider_data->>(.+)$/);
    if (!path) return row[column];
    const raw = row.raw_provider_data as Record<string, unknown> | null;
    const v = raw?.[path[1]];
    return v === undefined || v === null ? null : String(v);
  };
  const later = <T>(fn: () => T) =>
    new Promise<T>((resolve) => queueMicrotask(() => resolve(fn())));
  return {
    rows,
    updates,
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table: string) {
      assertStrictEquals(table, "chat_messages");
      const filters: Array<[string, unknown]> = [];
      const matching = () =>
        rows.filter((row) => filters.every(([c, v]) => value(row, c) === v));
      let patch: Row | null = null;
      const b = {
        select: () => b,
        update: (next: Row) => {
          patch = next;
          return b;
        },
        eq: (column: string, v: unknown) => {
          filters.push([column, v]);
          return b;
        },
        limit: () => b,
        maybeSingle: () =>
          later(() =>
            opts.selectError
              ? { data: null, error: opts.selectError }
              : { data: structuredClone(matching()[0] ?? null), error: null },
          ),
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          later(() => {
            if (!patch) return { data: matching(), error: null };
            if (opts.updateError)
              return { data: null, error: opts.updateError };
            const hit = matching();
            for (const row of hit) Object.assign(row, patch);
            updates.push(patch);
            return { data: hit.map((row) => ({ id: row.id })), error: null };
          }).then(resolve, reject),
      };
      return b;
    },
  };
}

const ECHO_KEY = {
  tenantId: TENANT,
  connectionUserId: OWNER,
  idMessage: "BAE5F1",
};

Deno.test(
  "race order 1: the send is stored first; its echo mirrors it to team channels once",
  async () => {
    // recordAutomationClientSend's row, as automationChatRow builds it.
    const stored = {
      id: "msg-1",
      tenant_id: TENANT,
      connection_user_id: OWNER,
      ...automationChatRow(
        { ...baseSend, chatId: "120363@g.us", candidateClientIds: [] },
        { clientId: null, groupId: GROUP },
      ),
    };
    const db = fakeChatMessages([stored]);
    assertEquals(await claimStoredSendTeamForward(db, ECHO_KEY), {
      id: "msg-1",
      groupId: GROUP,
      messageText: "שלום, הדוח החודשי מוכן",
    });
    // Marked done, the provider response and the stamp kept.
    assertEquals(db.rows[0].raw_provider_data, {
      idMessage: "BAE5F1",
      automation: true,
      team_forward: "done",
    });
    // A redelivered echo finds nothing left to mirror.
    assertStrictEquals(await claimStoredSendTeamForward(db, ECHO_KEY), null);
    assertStrictEquals(db.updates.length, 1);
  },
);

Deno.test(
  "two deliveries of one echo at once mirror it only once",
  async () => {
    const db = fakeChatMessages([
      {
        id: "msg-1",
        tenant_id: TENANT,
        connection_user_id: OWNER,
        group_id: null,
        message_text: "תזכורת לפגישה מחר",
        raw_provider_data: {
          idMessage: "BAE5F1",
          automation: true,
          team_forward: "pending",
        },
      },
    ]);
    const claims = await Promise.all([
      claimStoredSendTeamForward(db, ECHO_KEY),
      claimStoredSendTeamForward(db, ECHO_KEY),
    ]);
    assertStrictEquals(claims.filter(Boolean).length, 1);
    assertStrictEquals(claims.find(Boolean)?.groupId, null);
  },
);

Deno.test(
  "race order 2: the echo is stored first; the merged row owes no second mirror",
  async () => {
    // The webhook stored and mirrored the echo; merge_green_api_send_echo then
    // stamped the send's kind on that row instead of a second row (no
    // team_forward), so a later delivery of the echo mirrors nothing.
    const db = fakeChatMessages([
      {
        id: "echo-1",
        tenant_id: TENANT,
        connection_user_id: OWNER,
        group_id: GROUP,
        message_text: "שלום, הדוח החודשי מוכן",
        send_kind: "automation",
        raw_provider_data: {
          typeWebhook: "outgoingAPIMessageReceived",
          idMessage: "BAE5F1",
          automation: true,
        },
      },
    ]);
    assertStrictEquals(await claimStoredSendTeamForward(db, ECHO_KEY), null);
    assertEquals(db.updates, []);
    // A send stored by send-green-api-message (a UI send, or Carmen's action
    // step) owes no mirror either, as before.
    const uiSend = fakeChatMessages([
      {
        id: "ui-1",
        tenant_id: TENANT,
        connection_user_id: OWNER,
        raw_provider_data: { idMessage: "BAE5F1" },
      },
    ]);
    assertStrictEquals(
      await claimStoredSendTeamForward(uiSend, ECHO_KEY),
      null,
    );
  },
);

Deno.test(
  "the mirror claim is scoped to the echo's tenant and connection and never throws",
  async () => {
    const pending = {
      id: "msg-1",
      tenant_id: TENANT,
      connection_user_id: OWNER,
      raw_provider_data: { idMessage: "BAE5F1", team_forward: "pending" },
    };
    for (const key of [
      { ...ECHO_KEY, tenantId: OTHER_TENANT },
      { ...ECHO_KEY, connectionUserId: "someone-else" },
      { ...ECHO_KEY, idMessage: "OTHER" },
      { ...ECHO_KEY, idMessage: "" },
      { ...ECHO_KEY, idMessage: undefined },
      { ...ECHO_KEY, connectionUserId: null },
    ])
      assertStrictEquals(
        await claimStoredSendTeamForward(fakeChatMessages([pending]), key),
        null,
        JSON.stringify(key),
      );
    for (const opts of [
      { selectError: { code: "57014" } },
      { updateError: { code: "40001" } },
    ]) {
      const db = fakeChatMessages([pending], opts);
      assertStrictEquals(await claimStoredSendTeamForward(db, ECHO_KEY), null);
    }
    const throwing = {
      rpc: () => Promise.resolve({ data: null, error: null }),
      from: () => {
        throw new Error("boom");
      },
    };
    assertStrictEquals(
      await claimStoredSendTeamForward(throwing, ECHO_KEY),
      null,
    );
  },
);

// ─── Webhook wiring ─────────────────────────────────────────────────────────

const GREEN_WEBHOOK = Deno.readTextFileSync(
  new URL("../green-api-webhook/index.ts", import.meta.url),
);
const MANUS_WEBHOOK = Deno.readTextFileSync(
  new URL("../manus-wa-webhook/index.ts", import.meta.url),
);

Deno.test(
  "green-api-webhook mirrors a stored send once, whichever write lands first",
  () => {
    // The duplicate check claims the mirror for an API echo before skipping it.
    const dedupe = GREEN_WEBHOOK.slice(
      GREEN_WEBHOOK.indexOf("const incomingIdMessage = webhookData.idMessage;"),
      GREEN_WEBHOOK.indexOf("const messageData = webhookData.messageData;"),
    );
    assertMatch(
      dedupe,
      /const isApiEcho = typeWebhook === "outgoingAPIMessageReceived";/,
    );
    assertMatch(
      dedupe,
      /\.select\("id, team_forward:raw_provider_data->>team_forward"\)/,
    );
    assertMatch(
      dedupe,
      /if \(dupMsg\) \{\s+if \(isApiEcho && dupMsg\.team_forward === "pending"\)\s+await forwardStoredSend\(\);\s+return new Response\(/,
    );
    assertMatch(
      dedupe,
      /claimStoredSendTeamForward\(supabaseClient, \{\s+tenantId,\s+connectionUserId,\s+idMessage: incomingIdMessage,\s+\}\)/,
    );
    assertMatch(
      dedupe,
      /if \(!stored\) return;\s+await forwardToTeamChannels\(/,
    );
    // Both inserts learn whether merge_green_api_send_echo dropped the echo,
    // and then claim the stored send's mirror instead of mirroring the echo.
    assertStrictEquals(
      GREEN_WEBHOOK.match(
        /raw_provider_data: (?:webhookData|rawDataWithAvatar),\s+\}\)\s+\.select\("id"\);/g,
      )?.length,
      2,
    );
    assertMatch(
      GREEN_WEBHOOK,
      /const groupEchoMerged =\s+isApiEcho &&\s+Array\.isArray\(savedGroupRows\) &&\s+savedGroupRows\.length === 0;/,
    );
    assertMatch(
      GREEN_WEBHOOK,
      /if \(groupEchoMerged\) \{\s+await forwardStoredSend\(\);\s+\} else \{\s+await forwardToTeamChannels\(/,
    );
    assertMatch(
      GREEN_WEBHOOK,
      /if \(isApiEcho && Array\.isArray\(savedRows\) && savedRows\.length === 0\) \{\s+await forwardStoredSend\(\);\s+\} else \{\s+await forwardToTeamChannels\(/,
    );
  },
);

Deno.test(
  "Carmen's webhook-fallback group replies are recorded after a successful send",
  () => {
    // Green API: the provider response (idMessage) is kept for the echo.
    assertMatch(
      GREEN_WEBHOOK,
      /const response = await sendGreenApiMessage\(\s+instanceId,\s+apiToken,\s+chatId,\s+message,\s+\);\s+if \(!response\) return false;[\s\S]{0,200}?await recordCarmenFallbackGroupReply\(supabaseClient, \{\s+tenantId,\s+chatId,\s+message,\s+provider: "green_api",\s+connectionUserId,\s+integrationId: integration\.id,\s+providerResponse: response,\s+\}\);\s+return true;/,
    );
    assertMatch(GREEN_WEBHOOK, /if \(!res\.ok\) return null;/);
    // Manus: only a group send the gateway accepted.
    assertMatch(
      MANUS_WEBHOOK,
      /if \(res\.ok\) \{[\s\S]{0,700}?if \(response\?\.success !== false\)\s+await recordCarmenFallbackGroupReply\(supabase, \{\s+tenantId: groupTenantId,\s+chatId: groupChatId,\s+message,\s+provider: "manus_wa",\s+connectionUserId,\s+integrationId: integ\.id,\s+providerResponse: response,\s+\}\);\s+\}\s+return res\.ok;/,
    );
  },
);
