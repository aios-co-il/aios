import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_SCOPE_NOTES,
  applyChatScope,
  chatContactRefusal,
  chatRoleTier,
  chatScopeFilters,
  chatScopeMeta,
  chatScopeRefusal,
  isActiveAssignment,
  isChatRowVisible,
  isGroupTurn,
  keepVisibleChatRows,
  phoneTail,
  resolveChatScope,
  withChatScopeColumns,
  type ChatScope,
} from "./chat-scope.ts";
import { fakeDb, parseOrFilter, evalFilter } from "./chat-scope-fake-db.ts";

const T = "10000000-0000-4000-8000-000000000001";
const DAVID = "d0000000-0000-4000-8000-00000000000d";
const DANA = "d0000000-0000-4000-8000-0000000000a1";
const DANA_CAMP = "c1000000-0000-4000-8000-0000000000a1";
const ORG_LINE = "d0000000-0000-4000-8000-0000000000f1";
const MANUS = "d0000000-0000-4000-8000-0000000000e1";
const AG1 = "a0000000-0000-4000-8000-000000000001";
const AG2 = "a0000000-0000-4000-8000-000000000002";
const CA = "c0000000-0000-4000-8000-00000000000a";
const CB = "c0000000-0000-4000-8000-00000000000b";
const CC = "c0000000-0000-4000-8000-00000000000c";
const GA = "f0000000-0000-4000-8000-00000000000a";
const GB = "f0000000-0000-4000-8000-00000000000b";
const GC = "f0000000-0000-4000-8000-00000000000c";
const L1 = "b0000000-0000-4000-8000-000000000001";
const L2 = "b0000000-0000-4000-8000-000000000002";
const SP = "5a000000-0000-4000-8000-000000000001";

function staff(over: Partial<ChatScope> = {}): ChatScope {
  return {
    mode: "staff",
    reason: null,
    groupId: null,
    connectionUserIds: [DANA, ORG_LINE],
    clientIds: [CA],
    leads: { all: false, agencyIds: [], salesPersonId: null },
    linkedGroupIds: [GA],
    ownThread: null,
    ...over,
  };
}

test("role tiers: owners keep full access, others are narrowed", () => {
  assert.equal(chatRoleTier("owner"), "full");
  assert.equal(chatRoleTier("super_admin"), "full");
  assert.equal(chatRoleTier("agency_owner"), "tenant");
  assert.equal(chatRoleTier("agency_manager"), "tenant");
  assert.equal(chatRoleTier("team_manager"), "team");
  assert.equal(chatRoleTier("campaigner"), "member");
  assert.equal(chatRoleTier("sales_person"), "member");
  assert.equal(chatRoleTier(null, DANA_CAMP), "member");
  assert.equal(chatRoleTier(null, null), null);
  assert.equal(chatRoleTier("system"), null);
});

test("group turns, phone tails and active assignments", () => {
  assert.equal(isGroupTurn({ chat_id: "120363000@g.us" }), true);
  assert.equal(isGroupTurn({ chat_id: "x", is_group: true }), true);
  assert.equal(isGroupTurn({ chat_id: "972501234567@c.us" }), false);
  assert.equal(isGroupTurn(null), false);
  assert.equal(phoneTail("972501234567@c.us"), "501234567");
  assert.equal(phoneTail("+972-50-123-4567"), "501234567");
  assert.equal(phoneTail("12345"), "");
  const today = "2026-10-26";
  assert.equal(isActiveAssignment({}, today), true);
  assert.equal(isActiveAssignment({ end_date: "2026-10-25" }, today), false);
  assert.equal(isActiveAssignment({ start_date: "2026-11-01" }, today), false);
  assert.equal(
    isActiveAssignment(
      { start_date: "2026-01-01", end_date: "2026-10-26" },
      today,
    ),
    true,
  );
});

test("withChatScopeColumns adds missing columns once and ignores embeds", () => {
  assert.equal(
    withChatScopeColumns("id, message_text, created_at"),
    "id, message_text, created_at, client_id, lead_id, group_id, provider, connection_user_id, sender_phone",
  );
  assert.equal(
    withChatScopeColumns(
      "message_text, sender_phone, group_id, provider, clients(name, client_id)",
    ),
    "message_text, sender_phone, group_id, provider, clients(name, client_id), client_id, lead_id, connection_user_id",
  );
});

test("row rule: green_api needs an allowed connection and a linked thread", () => {
  const scope = staff();
  const row = (r: Record<string, unknown>) => isChatRowVisible(r, scope);
  assert.equal(
    row({ provider: "green_api", connection_user_id: ORG_LINE, client_id: CA }),
    true,
  );
  assert.equal(
    row({ provider: "green_api", connection_user_id: DAVID, client_id: CA }),
    false,
    "David's private line stays hidden even for the campaigner's own client",
  );
  assert.equal(
    row({ provider: "green_api", connection_user_id: null, client_id: CA }),
    false,
  );
  assert.equal(
    row({ provider: "manus_wa", connection_user_id: MANUS, client_id: CB }),
    false,
    "another campaigner's client",
  );
  assert.equal(
    row({ provider: "manus_wa", connection_user_id: MANUS, group_id: GA }),
    true,
  );
  assert.equal(
    row({ provider: "green_api", connection_user_id: ORG_LINE }),
    false,
    "unlinked thread",
  );
  assert.equal(isChatRowVisible({ provider: "manus_wa" }, chatNone()), false);
  assert.equal(
    isChatRowVisible({ provider: "green_api" }, { ...staff(), mode: "full" }),
    true,
  );
});

function chatNone(): ChatScope {
  return { ...staff(), mode: "none", reason: CHAT_SCOPE_NOTES.notStaff };
}

test("own private chat with Carmen: manus only, same line, same phone", () => {
  const scope = staff({
    clientIds: [],
    linkedGroupIds: [],
    ownThread: { phoneTail: "501234567", connectionUserId: MANUS },
  });
  const own = {
    provider: "manus_wa",
    connection_user_id: MANUS,
    sender_phone: "972501234567",
  };
  assert.equal(isChatRowVisible(own, scope), true);
  assert.equal(
    isChatRowVisible({ ...own, sender_phone: "972509999999" }, scope),
    false,
  );
  assert.equal(isChatRowVisible({ ...own, group_id: GA }, scope), false);
  assert.equal(
    isChatRowVisible(
      { ...own, provider: "green_api", connection_user_id: DANA },
      scope,
    ),
    false,
  );
});

test("filters: full adds nothing, none matches nothing", () => {
  assert.deepEqual(chatScopeFilters({ ...staff(), mode: "full" }), []);
  assert.deepEqual(chatScopeFilters(chatNone()), [
    { op: "is", column: "id", value: null },
  ]);
  assert.deepEqual(
    chatScopeFilters(staff({ clientIds: [], linkedGroupIds: [] })),
    [{ op: "is", column: "id", value: null }],
  );
});

test("filters: a group turn reads only that group", () => {
  const group = { ...staff(), mode: "group" as const, groupId: GA };
  assert.deepEqual(chatScopeFilters({ ...group, connectionUserIds: [] }), [
    { op: "eq", column: "group_id", value: GA },
    { op: "neq", column: "provider", value: "green_api" },
  ]);
  assert.deepEqual(chatScopeFilters(group), [
    { op: "eq", column: "group_id", value: GA },
    {
      op: "or",
      value: `provider.neq.green_api,connection_user_id.in.(${DANA},${ORG_LINE})`,
    },
  ]);
});

test("filters: the staff or() string parses and matches the row rule", () => {
  const scope = staff({
    leads: { all: false, agencyIds: [AG1], salesPersonId: null },
    ownThread: { phoneTail: "501234567", connectionUserId: MANUS },
  });
  const [only] = chatScopeFilters(scope);
  assert.equal(only.op, "or");
  const tree = parseOrFilter((only as { value: string }).value);
  const rows = [
    { provider: "green_api", connection_user_id: ORG_LINE, client_id: CA },
    { provider: "green_api", connection_user_id: DAVID, client_id: CA },
    { provider: "manus_wa", connection_user_id: MANUS, client_id: CB },
    { provider: "manus_wa", connection_user_id: MANUS, group_id: GA },
    { provider: "green_api", connection_user_id: DAVID },
    {
      provider: "manus_wa",
      connection_user_id: MANUS,
      sender_phone: "972501234567",
    },
    {
      provider: "manus_wa",
      connection_user_id: MANUS,
      sender_phone: "972508888888",
    },
  ];
  for (const r of rows)
    assert.equal(
      evalFilter(r, tree),
      isChatRowVisible(r, scope),
      JSON.stringify(r),
    );
});

test("filters: long id lists fall back to a coarse filter", () => {
  const many = Array.from(
    { length: 200 },
    (_, i) => `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  const [only] = chatScopeFilters(staff({ clientIds: many }));
  assert.match((only as { value: string }).value, /client_id\.not\.is\.null/);
});

test("applyChatScope chains the filters on a query", async () => {
  const { db, queries } = fakeDb({
    chat_messages: [
      {
        id: "1",
        provider: "manus_wa",
        group_id: GA,
        connection_user_id: MANUS,
      },
      {
        id: "2",
        provider: "green_api",
        group_id: GA,
        connection_user_id: DAVID,
      },
      { id: "3", provider: "manus_wa", group_id: GB },
    ],
  });
  const scope = {
    ...staff(),
    mode: "group" as const,
    groupId: GA,
    connectionUserIds: [],
  };
  const { data } = await applyChatScope(
    db.from("chat_messages").select("id"),
    scope,
  );
  assert.deepEqual(
    data.map((r: { id: string }) => r.id),
    ["1"],
  );
  assert.deepEqual(queries[0].calls, ["eq:group_id", "neq:provider"]);
});

function world() {
  return fakeDb(
    {
      whatsapp_groups: [
        { id: GA, tenant_id: T, group_chat_id: "120363-a@g.us" },
      ],
      profiles: [
        { id: DANA, campaigner_id: DANA_CAMP, sales_person_id: null },
        { id: DAVID, campaigner_id: null, sales_person_id: SP },
      ],
      client_team: [
        { campaigner_id: DANA_CAMP, client_id: CA, start_date: "2026-01-01" },
        { campaigner_id: DANA_CAMP, client_id: CC, end_date: "2026-09-30" },
      ],
      clients: [
        { id: CA, tenant_id: T, agency_id: AG1, whatsapp_group_id: GA },
        { id: CB, tenant_id: T, agency_id: AG1, whatsapp_group_id: null },
        { id: CC, tenant_id: T, agency_id: AG2, whatsapp_group_id: GC },
      ],
      team_channel_whatsapp_links: [],
      carmen_client_group_access: [
        { tenant_id: T, client_id: CB, whatsapp_group_id: GB },
      ],
      leads: [
        { id: L1, tenant_id: T, agency_id: AG1, sales_person_id: null },
        { id: L2, tenant_id: T, agency_id: AG2, sales_person_id: SP },
      ],
    },
    {
      chat_allowed_connection_user_ids: (args) =>
        args.p_user_id === DANA ? [DANA, ORG_LINE] : [args.p_user_id],
    },
  );
}

const base = {
  tenantId: T,
  accessibleTenantIds: [T],
  managedAgencyIds: [],
  today: "2026-10-26",
};

test("resolve: owner keeps today's access without any lookup", async () => {
  const { db, queries, rpcCalls } = world();
  const scope = await resolveChatScope(db, {
    ...base,
    userId: DAVID,
    callerRole: "owner",
    callerCampaignerId: null,
    waNotify: { chat_id: "120363-a@g.us", is_group: true },
  });
  assert.equal(scope.mode, "full");
  assert.equal(queries.length + rpcCalls.length, 0);
  assert.deepEqual(chatScopeMeta(scope), {});
});

test("resolve: in-app campaigner gets active client_team clients only", async () => {
  const { db, rpcCalls } = world();
  const scope = await resolveChatScope(db, {
    ...base,
    userId: DANA,
    callerRole: "campaigner",
    callerCampaignerId: null,
  });
  assert.equal(scope.mode, "staff");
  assert.deepEqual(scope.clientIds, [CA], "ended assignment to C dropped");
  assert.deepEqual(scope.linkedGroupIds, [GA]);
  assert.deepEqual(scope.connectionUserIds, [DANA, ORG_LINE]);
  assert.equal(scope.ownThread, null);
  assert.deepEqual(rpcCalls, [
    {
      fn: "chat_allowed_connection_user_ids",
      args: { p_tenant_id: T, p_user_id: DANA },
    },
  ]);
});

test("resolve: team manager gets the agency's clients and leads", async () => {
  const { db } = world();
  const scope = await resolveChatScope(db, {
    ...base,
    userId: DANA,
    callerRole: "team_manager",
    callerCampaignerId: null,
    managedAgencyIds: [AG1],
  });
  assert.deepEqual([...(scope.clientIds as string[])].sort(), [CA, CB].sort());
  assert.deepEqual(scope.leads.agencyIds, [AG1]);
  assert.deepEqual([...scope.linkedGroupIds].sort(), [GA, GB].sort());
});

test("resolve: agency owner reads all linked threads, sales person own leads", async () => {
  const { db } = world();
  const tenantWide = await resolveChatScope(db, {
    ...base,
    userId: DANA,
    callerRole: "agency_owner",
    callerCampaignerId: null,
  });
  assert.equal(tenantWide.clientIds, "all");
  assert.equal(tenantWide.leads.all, true);
  assert.deepEqual([...tenantWide.linkedGroupIds].sort(), [GA, GB, GC].sort());
  const sales = await resolveChatScope(world().db, {
    ...base,
    userId: DAVID,
    callerRole: "sales_person",
    callerCampaignerId: null,
  });
  assert.equal(sales.leads.salesPersonId, SP);
  assert.deepEqual(sales.clientIds, []);
});

test("resolve: WhatsApp turns — group, own chat, unknown sender", async () => {
  const group = await resolveChatScope(world().db, {
    ...base,
    userId: null,
    callerRole: null,
    callerCampaignerId: null,
    waNotify: { chat_id: "120363-a@g.us", is_group: true },
  });
  assert.equal(group.mode, "group");
  assert.equal(group.groupId, GA);
  assert.deepEqual(group.connectionUserIds, []);

  const missing = await resolveChatScope(world().db, {
    ...base,
    userId: DANA,
    callerRole: "campaigner",
    callerCampaignerId: DANA_CAMP,
    waNotify: { chat_id: "999@g.us", is_group: true },
  });
  assert.equal(missing.mode, "none");
  assert.equal(missing.reason, CHAT_SCOPE_NOTES.groupNotFound);

  const own = await resolveChatScope(world().db, {
    ...base,
    userId: DANA,
    callerRole: "campaigner",
    callerCampaignerId: DANA_CAMP,
    waNotify: { chat_id: "972501234567@c.us", connection_user_id: MANUS },
  });
  assert.deepEqual(own.ownThread, {
    phoneTail: "501234567",
    connectionUserId: MANUS,
  });
  assert.equal(
    chatScopeMeta(own).access_note,
    CHAT_SCOPE_NOTES.staffWithOwnChat,
  );

  const stranger = await resolveChatScope(world().db, {
    ...base,
    userId: null,
    callerRole: null,
    callerCampaignerId: null,
    waNotify: { chat_id: "972507777777@c.us", connection_user_id: MANUS },
  });
  assert.equal(stranger.mode, "none");
  assert.deepEqual(chatScopeRefusal(stranger), {
    count: 0,
    messages: [],
    access_scope: "none",
    note: CHAT_SCOPE_NOTES.notStaff,
  });
  const system = await resolveChatScope(world().db, {
    ...base,
    userId: null,
    callerRole: null,
    callerCampaignerId: null,
  });
  assert.equal(system.mode, "none");
});

test("resolve: a failing connection lookup hides green_api rows", async () => {
  const { db } = fakeDb(
    { profiles: [], client_team: [], clients: [] },
    {
      chat_allowed_connection_user_ids: () => {
        throw new Error("function does not exist");
      },
    },
  );
  const warn = console.warn;
  console.warn = () => {};
  try {
    const scope = await resolveChatScope(db, {
      ...base,
      userId: DANA,
      callerRole: "agency_owner",
      callerCampaignerId: null,
    });
    assert.deepEqual(scope.connectionUserIds, []);
    assert.equal(
      isChatRowVisible(
        { provider: "green_api", connection_user_id: DANA, client_id: CA },
        scope,
      ),
      false,
    );
  } finally {
    console.warn = warn;
  }
});

test("lead rows are checked against the lead's agency or salesperson", async () => {
  const { db } = world();
  const rows = [
    { id: "1", provider: "manus_wa", lead_id: L1 },
    { id: "2", provider: "manus_wa", lead_id: L2 },
  ];
  const byAgency = staff({
    clientIds: [],
    linkedGroupIds: [],
    leads: { all: false, agencyIds: [AG1], salesPersonId: null },
  });
  assert.deepEqual(
    (await keepVisibleChatRows(db, rows, byAgency, [T])).map((r) => r.id),
    ["1"],
  );
  const bySales = staff({
    clientIds: [],
    linkedGroupIds: [],
    leads: { all: false, agencyIds: [], salesPersonId: SP },
  });
  assert.deepEqual(
    (await keepVisibleChatRows(db, rows, bySales, [T])).map((r) => r.id),
    ["2"],
  );
});

test("get_chat_history contact check", async () => {
  const { db } = world();
  const scope = staff({
    leads: { all: false, agencyIds: [AG1], salesPersonId: null },
  });
  assert.equal(await chatContactRefusal(db, scope, "client", CA, [T]), null);
  assert.equal(
    (await chatContactRefusal(db, scope, "client", CB, [T]))?.note,
    CHAT_SCOPE_NOTES.clientOutOfScope,
  );
  assert.equal(await chatContactRefusal(db, scope, "lead", L1, [T]), null);
  assert.equal(
    (await chatContactRefusal(db, scope, "lead", L2, [T]))?.error,
    "access_denied",
  );
  assert.equal(
    await chatContactRefusal(db, { ...scope, mode: "full" }, "client", CB, [T]),
    null,
  );
});
