import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyChatScope,
  chatContactRefusal,
  chatScopeRefusal,
  keepVisibleChatRows,
  resolveChatScope,
  withChatScopeColumns,
} from "./carmen/chat-scope.ts";
import { fakeDb } from "./carmen/chat-scope-fake-db.ts";

const carmen = readFileSync(new URL("./carmen.ts", import.meta.url), "utf8");
const agent = readFileSync(
  new URL("../run-ai-agent/index.ts", import.meta.url),
  "utf8",
);

test("private chats use session_only — never phone-scan chat_messages for background", () => {
  assert.match(carmen, /export function backgroundChatContextMode\(\s*isGroup/);
  assert.match(carmen, /session_only/);
  assert.match(
    carmen,
    /skip private background history — session chat_id only/,
  );
  // Private branch must not ilike sender_phone inside fetchRecentChatContext.
  const fnStart = carmen.indexOf(
    "export async function fetchRecentChatContext",
  );
  const fnEnd = carmen.indexOf("export function excludeCurrentTurnFromContext");
  const fn = carmen.slice(fnStart, fnEnd);
  assert.doesNotMatch(fn, /ilike\('sender_phone'/);
  assert.match(fn, /group_id/);
});

test("isolation note is injected on Carmen turns", () => {
  assert.match(carmen, /\[בידוד שיחה\] chat_id=/);
});

test("search_conversation_history defaults to current wa_notify chat_id", () => {
  assert.match(agent, /browse_all_chats/);
  assert.match(agent, /scopeGroupId/);
  assert.match(agent, /current_chat/);
});

// ── Chat scope (AIO-231) ────────────────────────────────────────────────────

function caseBody(name) {
  const start = agent.indexOf(`case "${name}": {`);
  assert.ok(start > 0, `case ${name} not found`);
  const end = agent.indexOf("\n    case ", start + 10);
  return agent.slice(start, end);
}

test("the three chat readers run through the chat scope wrapper", () => {
  for (const name of [
    "get_chat_history",
    "search_conversation_history",
    "get_recent_inbound_messages",
  ]) {
    const body = caseBody(name);
    assert.match(body, /await chatScopeFor\(\)/, name);
    assert.match(body, /chatScope\.mode === "none"/, name);
    assert.match(body, /applyChatScope\(/, name);
    assert.match(body, /keepVisibleChatRows\(/, name);
    assert.match(body, /withChatScopeColumns\(/, name);
  }
  assert.match(caseBody("get_chat_history"), /chatContactRefusal\(/);
  // The scope input comes from the verified caller, not from tool args.
  const scopeInput = agent.slice(
    agent.indexOf("const chatScopeFor = () =>"),
    agent.indexOf("if (isVideoDirectorTool(name))"),
  );
  assert.doesNotMatch(scopeInput, /args\./);
  assert.match(scopeInput, /userId: actorUserId/);
  // callerRole is the highest role across all tenants; the scope reads the
  // role in this tenant itself.
  assert.doesNotMatch(scopeInput, /callerRole|managedAgencyIds/);
});

test("get_recent_inbound_messages keeps its old output shape", () => {
  assert.match(
    caseBody("get_recent_inbound_messages"),
    /connection_user_id: _conn,\s*provider: _provider,\s*group_id: _group,/,
  );
});

test("send_message looks up the client or lead inside the caller's tenants", () => {
  const body = caseBody("send_message");
  const lookups = body.match(/\.in\("tenant_id", accessibleTenantIds\)/g);
  assert.equal(lookups?.length, 2);
});

test("only service callers may set the WhatsApp chat and sender phone", () => {
  // bindRunAgentCaller strips lead_data and wa_notify from non-service requests
  // (run-agent-trust.test.mjs covers the helper itself).
  const serve = agent.slice(agent.indexOf("Deno.serve(async (req) =>"));
  const guard = serve.slice(0, serve.indexOf("if (bodyJson.direct_tool)"));
  assert.match(guard, /bindRunAgentCaller\(bodyJson, auth\);/);
});

// A tenant with David (owner) on his private Green API line, an org-wide Green
// line, Carmen's Manus line, campaigner Dana (client A), campaigner Ronit
// (client B), an agency owner, a team manager of agency 1, Maya (owner of
// another tenant, campaigner of client A here), and a client contact who talks
// to Carmen in client A's group.
const T = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const DAVID = "d0000000-0000-4000-8000-00000000000d";
const DANA = "d0000000-0000-4000-8000-0000000000a1";
const RONIT = "d0000000-0000-4000-8000-0000000000a2";
const AG_OWNER = "d0000000-0000-4000-8000-0000000000a3";
const TEAM_MGR = "d0000000-0000-4000-8000-0000000000a4";
const MAYA = "d0000000-0000-4000-8000-0000000000a5";
const ORG_LINE = "d0000000-0000-4000-8000-0000000000f1";
const MANUS = "d0000000-0000-4000-8000-0000000000e1";
const DANA_CAMP = "c1000000-0000-4000-8000-0000000000a1";
const RONIT_CAMP = "c1000000-0000-4000-8000-0000000000a2";
const MAYA_CAMP = "c1000000-0000-4000-8000-0000000000a5";
const AG1 = "a0000000-0000-4000-8000-000000000001";
const CA = "c0000000-0000-4000-8000-00000000000a";
const CB = "c0000000-0000-4000-8000-00000000000b";
const GA = "f0000000-0000-4000-8000-00000000000a";
const GB = "f0000000-0000-4000-8000-00000000000b";
const GFAM = "f0000000-0000-4000-8000-0000000000ff";
const L1 = "b0000000-0000-4000-8000-000000000001";
const DANA_PHONE = "972501111111";
const DAVID_PHONE = "972509999999";
const MAYA_PHONE = "972502222222";

const integrations = [
  { tenant_id: T, user_id: DAVID, connection_visibility: "private" },
  { tenant_id: T, user_id: ORG_LINE, connection_visibility: "org" },
  { tenant_id: T, user_id: MANUS, connection_visibility: "private" },
];

// The get_chat_contacts rule (own + org + explicitly shared; super admin all),
// as chat_allowed_connection_user_ids returns it. The SQL itself is checked
// by carmen/chat-scope-sql.test.mjs and supabase/ops/verify_chat_allowed_connections.sql.
function allowedConnections({ p_tenant_id, p_user_id }) {
  const owners = new Set([p_user_id]);
  for (const ti of integrations)
    if (
      ti.tenant_id === p_tenant_id &&
      (ti.user_id === p_user_id || ti.connection_visibility === "org")
    )
      owners.add(ti.user_id);
  return [...owners];
}

let minute = 0;
function msg(id, fields) {
  minute += 1;
  return {
    id,
    tenant_id: T,
    direction: "inbound",
    message_text: `תקציב ${id}`,
    created_at: `2026-10-26T08:${String(minute).padStart(2, "0")}:00Z`,
    client_id: null,
    lead_id: null,
    group_id: null,
    sender_name: id,
    ...fields,
  };
}

const messages = [
  msg("a-dm-on-david-green", {
    client_id: CA,
    provider: "green_api",
    connection_user_id: DAVID,
    sender_phone: "972500000001",
  }),
  msg("a-dm-on-org-green", {
    client_id: CA,
    provider: "green_api",
    connection_user_id: ORG_LINE,
    sender_phone: "972500000001",
  }),
  msg("b-dm-on-org-green", {
    client_id: CB,
    provider: "green_api",
    connection_user_id: ORG_LINE,
    sender_phone: "972500000002",
  }),
  msg("a-group-on-manus", {
    group_id: GA,
    provider: "manus_wa",
    connection_user_id: MANUS,
    sender_phone: "972500000011",
  }),
  msg("a-group-on-david-green", {
    group_id: GA,
    provider: "green_api",
    connection_user_id: DAVID,
    sender_phone: "972500000011",
  }),
  msg("b-group-on-manus", {
    group_id: GB,
    provider: "manus_wa",
    connection_user_id: MANUS,
    sender_phone: "972500000012",
  }),
  msg("david-private-dm", {
    provider: "green_api",
    connection_user_id: DAVID,
    sender_phone: "972544444444",
  }),
  msg("david-family-group", {
    group_id: GFAM,
    provider: "green_api",
    connection_user_id: DAVID,
    sender_phone: "972544444445",
  }),
  msg("dana-chat-with-carmen", {
    provider: "manus_wa",
    connection_user_id: MANUS,
    sender_phone: DANA_PHONE,
  }),
  msg("david-chat-with-carmen", {
    provider: "manus_wa",
    connection_user_id: MANUS,
    sender_phone: DAVID_PHONE,
  }),
  msg("lead-dm-on-org-green", {
    lead_id: L1,
    provider: "green_api",
    connection_user_id: ORG_LINE,
    sender_phone: "972500000021",
  }),
  msg("other-tenant", {
    tenant_id: T2,
    provider: "manus_wa",
    connection_user_id: MANUS,
    sender_phone: "972500000031",
  }),
];

// user_roles is per tenant. run-ai-agent's callerRole is the highest role
// across every tenant, so Maya would count as an owner there.
const userRoles = [
  { user_id: DAVID, role: "owner", tenant_id: T },
  { user_id: DANA, role: "campaigner", tenant_id: T },
  { user_id: RONIT, role: "campaigner", tenant_id: T },
  { user_id: AG_OWNER, role: "agency_owner", tenant_id: T },
  { user_id: TEAM_MGR, role: "team_manager", tenant_id: T },
  { user_id: MAYA, role: "owner", tenant_id: T2 },
  { user_id: MAYA, role: "agency_owner", tenant_id: T2 },
  { user_id: MAYA, role: "campaigner", tenant_id: T },
];

function world() {
  return fakeDb(
    {
      chat_messages: messages,
      user_roles: userRoles,
      user_managed_agencies: [
        { user_id: TEAM_MGR, agency_id: AG1 },
        { user_id: MAYA, agency_id: AG1 },
      ],
      whatsapp_groups: [
        { id: GA, tenant_id: T, group_chat_id: "120363-a@g.us" },
        { id: GB, tenant_id: T, group_chat_id: "120363-b@g.us" },
        { id: GFAM, tenant_id: T, group_chat_id: "120363-family@g.us" },
      ],
      profiles: [
        { id: DANA, campaigner_id: DANA_CAMP },
        { id: RONIT, campaigner_id: RONIT_CAMP },
        { id: AG_OWNER, campaigner_id: null },
        { id: TEAM_MGR, campaigner_id: null },
        { id: MAYA, campaigner_id: MAYA_CAMP },
      ],
      client_team: [
        { campaigner_id: DANA_CAMP, client_id: CA, start_date: "2026-01-01" },
        { campaigner_id: MAYA_CAMP, client_id: CA, start_date: "2026-01-01" },
        { campaigner_id: RONIT_CAMP, client_id: CB, start_date: "2026-01-01" },
      ],
      clients: [
        { id: CA, tenant_id: T, agency_id: AG1, whatsapp_group_id: GA },
        { id: CB, tenant_id: T, agency_id: AG1, whatsapp_group_id: null },
      ],
      team_channel_whatsapp_links: [],
      carmen_client_group_access: [
        { tenant_id: T, client_id: CB, whatsapp_group_id: GB },
      ],
      leads: [{ id: L1, tenant_id: T, agency_id: AG1, sales_person_id: null }],
    },
    { chat_allowed_connection_user_ids: allowedConnections },
  );
}

// Each caller as run-ai-agent passes it: the verified user id and, on a
// WhatsApp turn, the sender's campaigner record and the chat. No role goes in.
const callers = {
  owner: { userId: DAVID, callerCampaignerId: null },
  danaInApp: { userId: DANA, callerCampaignerId: null },
  danaOnWhatsApp: {
    userId: DANA,
    callerCampaignerId: DANA_CAMP,
    waNotify: {
      chat_id: `${DANA_PHONE}@c.us`,
      is_group: false,
      connection_user_id: MANUS,
    },
  },
  ronit: { userId: RONIT, callerCampaignerId: null },
  agencyOwner: { userId: AG_OWNER, callerCampaignerId: null },
  teamManager: { userId: TEAM_MGR, callerCampaignerId: null },
  ownerElsewhereInApp: { userId: MAYA, callerCampaignerId: null },
  ownerElsewhereOnWhatsApp: {
    userId: MAYA,
    callerCampaignerId: MAYA_CAMP,
    waNotify: {
      chat_id: `${MAYA_PHONE}@c.us`,
      is_group: false,
      connection_user_id: MANUS,
    },
  },
  groupContact: {
    userId: null,
    callerCampaignerId: null,
    waNotify: {
      chat_id: "120363-a@g.us",
      is_group: true,
      connection_user_id: MANUS,
    },
  },
  unknownPrivateSender: {
    userId: null,
    callerCampaignerId: null,
    waNotify: { chat_id: "972507777777@c.us", connection_user_id: MANUS },
  },
};

function input(caller) {
  return {
    tenantId: T,
    accessibleTenantIds: [T],
    today: "2026-10-26",
    ...caller,
  };
}

// The same steps run-ai-agent takes in each reader: resolve the scope from
// the caller, push it into the query, then filter the rows again.
async function readChats(caller, { contact, keyword } = {}) {
  const { db } = world();
  const scope = await resolveChatScope(db, input(caller));
  if (scope.mode === "none") return { refused: chatScopeRefusal(scope) };
  if (contact) {
    const refusal = await chatContactRefusal(
      db,
      scope,
      contact.type,
      contact.id,
      [T],
    );
    if (refusal) return { refused: refusal };
  }
  let q = db
    .from("chat_messages")
    .select(withChatScopeColumns("id, message_text, created_at"))
    .in("tenant_id", [T])
    .order("created_at", { ascending: false })
    .limit(100);
  if (contact)
    q = q.eq(contact.type === "client" ? "client_id" : "lead_id", contact.id);
  if (keyword) q = q.ilike("message_text", `%${keyword}%`);
  const { data: pushed } = await applyChatScope(q, scope);
  const rows = await keepVisibleChatRows(db, pushed, scope, [T]);
  return {
    mode: scope.mode,
    ids: rows.map((r) => r.id).sort(),
    pushedIds: pushed.map((r) => r.id).sort(),
  };
}

const ALL_TENANT_ROWS = messages
  .filter((m) => m.tenant_id === T)
  .map((m) => m.id)
  .sort();

test("matrix: owner keeps today's tenant-wide access", async () => {
  const { ids } = await readChats(callers.owner, { keyword: "תקציב" });
  assert.deepEqual(ids, ALL_TENANT_ROWS);
  const history = await readChats(callers.owner, {
    contact: { type: "client", id: CB },
  });
  assert.deepEqual(history.ids, ["b-dm-on-org-green"]);
});

test("matrix: campaigner of client A asking about client B gets nothing of B", async () => {
  const history = await readChats(callers.danaInApp, {
    contact: { type: "client", id: CB },
  });
  assert.equal(history.refused?.error, "access_denied");
  assert.match(history.refused?.note, /לא משויך אליך/);

  // Widest possible read (keyword over every chat): only A's linked threads,
  // and A's DMs only from the org-wide line, not David's private line.
  const all = await readChats(callers.danaInApp, { keyword: "תקציב" });
  assert.deepEqual(all.ids, ["a-dm-on-org-green", "a-group-on-manus"]);
  assert.deepEqual(all.pushedIds, all.ids, "the DB filter alone is exact");

  const own = await readChats(callers.danaInApp, {
    contact: { type: "client", id: CA },
  });
  assert.deepEqual(own.ids, ["a-dm-on-org-green"]);

  const onWhatsApp = await readChats(callers.danaOnWhatsApp, {
    keyword: "תקציב",
  });
  assert.deepEqual(onWhatsApp.ids, [
    "a-dm-on-org-green",
    "a-group-on-manus",
    "dana-chat-with-carmen",
  ]);

  const ronit = await readChats(callers.ronit, { keyword: "תקציב" });
  assert.deepEqual(ronit.ids, ["b-dm-on-org-green", "b-group-on-manus"]);
});

test("matrix: owner of another tenant, campaigner here, gets staff scope only", async () => {
  const inApp = await readChats(callers.ownerElsewhereInApp, {
    keyword: "תקציב",
  });
  assert.equal(inApp.mode, "staff");
  assert.deepEqual(inApp.ids, ["a-dm-on-org-green", "a-group-on-manus"]);
  assert.deepEqual(inApp.pushedIds, inApp.ids);

  const askAboutB = await readChats(callers.ownerElsewhereInApp, {
    contact: { type: "client", id: CB },
  });
  assert.equal(askAboutB.refused?.error, "access_denied");

  const onWhatsApp = await readChats(callers.ownerElsewhereOnWhatsApp, {
    keyword: "תקציב",
  });
  assert.equal(onWhatsApp.mode, "staff");
  assert.deepEqual(onWhatsApp.ids, ["a-dm-on-org-green", "a-group-on-manus"]);
});

test("matrix: a client contact in a group reads only that group on Carmen's line", async () => {
  const all = await readChats(callers.groupContact, { keyword: "תקציב" });
  assert.deepEqual(all.ids, ["a-group-on-manus"]);
  assert.deepEqual(all.pushedIds, all.ids);
  const otherClient = await readChats(callers.groupContact, {
    contact: { type: "client", id: CB },
  });
  assert.deepEqual(otherClient.ids, []);
});

test("matrix: David's private DM thread is visible to nobody but the owner", async () => {
  const privateRows = [
    "david-private-dm",
    "david-family-group",
    "a-dm-on-david-green",
    "a-group-on-david-green",
    "david-chat-with-carmen",
  ];
  for (const [name, caller] of Object.entries(callers)) {
    if (name === "owner") continue;
    const res = await readChats(caller, { keyword: "תקציב" });
    const seen = [...(res.ids ?? []), ...(res.pushedIds ?? [])];
    for (const row of privateRows)
      assert.ok(!seen.includes(row), `${name} must not read ${row}`);
  }
});

test("matrix: managers see their linked threads on lines they may read", async () => {
  const agencyOwner = await readChats(callers.agencyOwner, {
    keyword: "תקציב",
  });
  assert.deepEqual(agencyOwner.ids, [
    "a-dm-on-org-green",
    "a-group-on-manus",
    "b-dm-on-org-green",
    "b-group-on-manus",
    "lead-dm-on-org-green",
  ]);
  const teamManager = await readChats(callers.teamManager, {
    keyword: "תקציב",
  });
  assert.deepEqual(teamManager.ids, agencyOwner.ids);
});

test("matrix: unknown private senders and system runs read nothing", async () => {
  const stranger = await readChats(callers.unknownPrivateSender, {
    keyword: "תקציב",
  });
  assert.equal(stranger.refused?.access_scope, "none");
  assert.deepEqual(stranger.refused?.messages, []);
  const system = await readChats({ userId: null, callerCampaignerId: null });
  assert.equal(system.refused?.access_scope, "none");
});
