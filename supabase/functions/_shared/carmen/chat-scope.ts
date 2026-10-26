/**
 * Who may read which WhatsApp rows through Carmen's chat tools
 * (get_chat_history, search_conversation_history, get_recent_inbound_messages).
 * AIO-231.
 *
 * run-ai-agent reads chat_messages with the service role, so RLS does not
 * limit these tools. The scope is built here only from the verified caller
 * (the JWT user, or the WhatsApp sender's staff record) and the WhatsApp chat
 * the turn came from. Tool arguments from the model are applied on top and
 * can only narrow it.
 *
 * The caller's role is read here from user_roles of this tenant (plus global,
 * tenant_id null, roles), never from run-ai-agent's callerRole: that one is
 * picked across all of the user's tenants, so an owner of another tenant
 * would get owner access here.
 *
 * - owner / super_admin: every chat of the tenant, as before.
 * - A WhatsApp group turn by anyone else: only that group's messages.
 * - Other staff: client- or lead-linked threads they are responsible for
 *   (campaigners: their active client_team clients; team managers: the
 *   clients and leads of the agencies they manage; agency owners/managers:
 *   all clients and leads; sales people: their assigned leads), plus their own
 *   private chat with Carmen on a WhatsApp turn.
 * - Everyone else (an unknown sender, a client contact in a private chat, a
 *   run with no person behind it): nothing.
 *
 * In every scope except owner/super_admin, a green_api row is visible only
 * when its connection is one the caller may read in the Chat page
 * (chat_allowed_connection_user_ids, the get_chat_contacts rule). Unlinked
 * threads, such as David's private DMs on his Green API line, never match.
 */
import { asUuidOrNull } from "../uuid.mjs";

export type ChatScopeMode = "full" | "group" | "staff" | "none";

export interface ChatScopeInput {
  tenantId: string;
  accessibleTenantIds: string[];
  /**
   * The verified caller's user id (JWT user or the sender's profile). Their
   * role and managed agencies are looked up for this tenant only.
   */
  userId: string | null;
  /**
   * The caller's campaigner record, if any (on WhatsApp: the sender's active
   * record in this tenant). Counts as a campaigner when no role is found.
   */
  callerCampaignerId: string | null;
  /** Set by service callers only (Carmen's WhatsApp webhook, automations). */
  waNotify?: {
    chat_id?: unknown;
    is_group?: unknown;
    connection_user_id?: unknown;
  } | null;
  /** YYYY-MM-DD in Israel time; defaults to today. Tests pass it. */
  today?: string;
}

export interface LeadScope {
  all: boolean;
  agencyIds: string[];
  salesPersonId: string | null;
}

export interface ChatScope {
  mode: ChatScopeMode;
  /** Why nothing is visible (mode "none"), for Carmen to relay. */
  reason: string | null;
  /** Mode "group": the current group's whatsapp_groups.id. */
  groupId: string | null;
  /** green_api rows only from these connection owners (all modes but full). */
  connectionUserIds: string[];
  /** Mode "staff": "all" = every client of the tenant, else these ids. */
  clientIds: "all" | string[];
  leads: LeadScope;
  /** Mode "staff": WhatsApp groups linked to the in-scope clients. */
  linkedGroupIds: string[];
  /** Mode "staff" on a private WhatsApp turn: the caller's own chat with Carmen. */
  ownThread: { phoneTail: string; connectionUserId: string | null } | null;
}

export interface ChatScopeRow {
  client_id?: string | null;
  lead_id?: string | null;
  group_id?: string | null;
  provider?: string | null;
  connection_user_id?: string | null;
  sender_phone?: string | null;
}

export interface LeadOwner {
  agency_id: string | null;
  sales_person_id: string | null;
}

/** Highest first: the order run-ai-agent uses to pick a caller's role. */
export const ROLE_PRIORITY = [
  "super_admin",
  "owner",
  "agency_owner",
  "agency_manager",
  "team_manager",
  "campaigner",
  "sales_person",
  "seo",
  "viewer",
];
/** Roles that keep today's tenant-wide chat access. */
const FULL_ROLES = ["owner", "super_admin"];
/** Staff who see every client- and lead-linked thread of the tenant. */
const TENANT_ROLES = ["agency_owner", "agency_manager"];
const MEMBER_ROLES = ["campaigner", "sales_person", "seo", "viewer"];

/** Columns the scope check needs on every chat_messages row it filters. */
export const CHAT_SCOPE_COLUMNS = [
  "client_id",
  "lead_id",
  "group_id",
  "provider",
  "connection_user_id",
  "sender_phone",
];

/** Above this many ids, push a coarse filter down and rely on the row check. */
const MAX_PUSHDOWN_IDS = 150;

export const CHAT_SCOPE_NOTES = {
  notStaff:
    "קריאת צ׳אטים זמינה רק לאנשי צוות מזוהים. אל תחשפי תוכן משיחות אחרות.",
  groupNotFound:
    "הקבוצה הנוכחית לא נמצאה, ולכן אין כאן גישה להיסטוריית צ׳אטים.",
  group: "בקבוצה אפשר לקרוא רק את ההודעות של הקבוצה הזו.",
  staff: "מוצגים רק צ׳אטים של לקוחות ולידים שבאחריותך.",
  staffWithOwnChat:
    "מוצגים רק צ׳אטים של לקוחות ולידים שבאחריותך, והשיחה הפרטית שלך איתי.",
  clientOutOfScope: "הלקוח הזה לא משויך אליך, ולכן אין לך גישה לצ׳אטים שלו.",
  leadOutOfScope: "הליד הזה לא באחריותך, ולכן אין לך גישה לצ׳אטים שלו.",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuids(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const s = typeof v === "string" ? v.trim() : "";
    if (UUID_RE.test(s)) out.add(s.toLowerCase());
  }
  return [...out];
}

function emptyScope(mode: ChatScopeMode): ChatScope {
  return {
    mode,
    reason: null,
    groupId: null,
    connectionUserIds: [],
    clientIds: [],
    leads: { all: false, agencyIds: [], salesPersonId: null },
    linkedGroupIds: [],
    ownThread: null,
  };
}

export const FULL_CHAT_SCOPE: ChatScope = Object.freeze(
  emptyScope("full"),
) as ChatScope;

function noneScope(reason: string): ChatScope {
  return { ...emptyScope("none"), reason };
}

/**
 * The chat tier of a role in this tenant (tenantRoleFor). A matched campaigner
 * record without a role still counts as a campaigner, as in
 * assertCallerCanAccessClient.
 */
export function chatRoleTier(
  tenantRole: string | null | undefined,
  callerCampaignerId?: string | null,
): "full" | "tenant" | "team" | "member" | null {
  const role = String(tenantRole || "");
  if (FULL_ROLES.includes(role)) return "full";
  if (TENANT_ROLES.includes(role)) return "tenant";
  if (role === "team_manager") return "team";
  if (MEMBER_ROLES.includes(role)) return "member";
  if (asUuidOrNull(callerCampaignerId)) return "member";
  return null;
}

export function isGroupTurn(waNotify: ChatScopeInput["waNotify"]): boolean {
  if (!waNotify) return false;
  const chatId = String(waNotify.chat_id || "");
  return /@g\.us$/i.test(chatId) || waNotify.is_group === true;
}

/** Last 9 digits of a phone or WhatsApp chat id; "" when too short. */
export function phoneTail(value: unknown): string {
  const digits = String(value || "")
    .split("@")[0]
    .replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

/** A client_team row is active when today is inside its start/end window. */
export function isActiveAssignment(
  row: { start_date?: string | null; end_date?: string | null },
  today: string,
): boolean {
  const start = row.start_date ? String(row.start_date).slice(0, 10) : null;
  const end = row.end_date ? String(row.end_date).slice(0, 10) : null;
  return (!start || start <= today) && (!end || end >= today);
}

export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function hasLeadAccess(leads: LeadScope): boolean {
  return leads.all || leads.agencyIds.length > 0 || !!leads.salesPersonId;
}

export function leadInScope(
  owner: LeadOwner | null | undefined,
  leads: LeadScope,
): boolean {
  if (leads.all) return true;
  if (!owner) return false;
  if (owner.agency_id && leads.agencyIds.includes(owner.agency_id)) return true;
  return !!leads.salesPersonId && owner.sales_person_id === leads.salesPersonId;
}

function isOwnThreadRow(
  row: ChatScopeRow,
  own: NonNullable<ChatScope["ownThread"]>,
): boolean {
  if (row.group_id) return false;
  if (row.provider !== "manus_wa") return false;
  if (own.connectionUserId && row.connection_user_id !== own.connectionUserId)
    return false;
  return phoneTail(row.sender_phone) === own.phoneTail;
}

/**
 * The row-level rule. Every row a chat tool returns passes through it, so a
 * query filter that is too wide can never leak a row.
 */
export function isChatRowVisible(
  row: ChatScopeRow,
  scope: ChatScope,
  leadOwners?: Map<string, LeadOwner> | null,
): boolean {
  if (scope.mode === "full") return true;
  if (scope.mode === "none") return false;
  if (row.provider === "green_api") {
    const conn = row.connection_user_id || "";
    if (!conn || !scope.connectionUserIds.includes(conn)) return false;
  }
  if (scope.mode === "group")
    return !!scope.groupId && row.group_id === scope.groupId;
  if (
    row.client_id &&
    (scope.clientIds === "all" || scope.clientIds.includes(row.client_id))
  )
    return true;
  if (row.group_id && scope.linkedGroupIds.includes(row.group_id)) return true;
  if (
    row.lead_id &&
    leadInScope(leadOwners?.get(row.lead_id) ?? null, scope.leads)
  )
    return true;
  return !!scope.ownThread && isOwnThreadRow(row, scope.ownThread);
}

export type ChatScopeFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "neq"; column: string; value: string }
  | { op: "is"; column: string; value: null }
  | { op: "or"; value: string };

function idList(ids: string[]): string {
  return `(${ids.join(",")})`;
}

function greenRule(scope: ChatScope): string {
  return scope.connectionUserIds.length
    ? `or(provider.neq.green_api,connection_user_id.in.${idList(scope.connectionUserIds)})`
    : "provider.neq.green_api";
}

/**
 * PostgREST filters that narrow a chat_messages query to the scope. They may
 * return a few rows too many (coarse lead and long-list filters); the row
 * check removes those.
 */
export function chatScopeFilters(scope: ChatScope): ChatScopeFilter[] {
  if (scope.mode === "full") return [];
  const nothing: ChatScopeFilter[] = [{ op: "is", column: "id", value: null }];
  if (scope.mode === "none") return nothing;
  if (scope.mode === "group") {
    if (!scope.groupId) return nothing;
    return [
      { op: "eq", column: "group_id", value: scope.groupId },
      scope.connectionUserIds.length
        ? {
            op: "or",
            value: `provider.neq.green_api,connection_user_id.in.${idList(scope.connectionUserIds)}`,
          }
        : { op: "neq", column: "provider", value: "green_api" },
    ];
  }
  const parts: string[] = [];
  if (scope.clientIds === "all") parts.push("client_id.not.is.null");
  else if (scope.clientIds.length > MAX_PUSHDOWN_IDS)
    parts.push("client_id.not.is.null");
  else if (scope.clientIds.length)
    parts.push(`client_id.in.${idList(scope.clientIds)}`);
  if (scope.linkedGroupIds.length > MAX_PUSHDOWN_IDS)
    parts.push("group_id.not.is.null");
  else if (scope.linkedGroupIds.length)
    parts.push(`group_id.in.${idList(scope.linkedGroupIds)}`);
  if (hasLeadAccess(scope.leads)) parts.push("lead_id.not.is.null");
  if (scope.ownThread) {
    const conn = scope.ownThread.connectionUserId
      ? `,connection_user_id.eq.${scope.ownThread.connectionUserId}`
      : "";
    parts.push(
      `and(group_id.is.null,provider.eq.manus_wa,sender_phone.ilike.*${scope.ownThread.phoneTail}*${conn})`,
    );
  }
  if (!parts.length) return nothing;
  return [
    { op: "or", value: `and(or(${parts.join(",")}),${greenRule(scope)})` },
  ];
}

/** Applies chatScopeFilters to a supabase-js chat_messages query. */
export function applyChatScope<Q>(query: Q, scope: ChatScope): Q {
  let q: any = query;
  for (const f of chatScopeFilters(scope)) {
    if (f.op === "or") q = q.or(f.value);
    else if (f.op === "is") q = q.is(f.column, f.value);
    else q = q[f.op](f.column, f.value);
  }
  return q;
}

/** Adds the columns the row check needs to a select list, without duplicates. */
export function withChatScopeColumns(select: string): string {
  const present = new Set<string>();
  let depth = 0;
  let current = "";
  for (const ch of select + ",") {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      const name = current.trim();
      if (name && !name.includes("(")) present.add(name);
      current = "";
    } else current += ch;
  }
  const missing = CHAT_SCOPE_COLUMNS.filter((c) => !present.has(c));
  return missing.length ? `${select}, ${missing.join(", ")}` : select;
}

/** What a chat tool returns when the caller may read nothing. */
export function chatScopeRefusal(scope: ChatScope) {
  return {
    count: 0,
    messages: [],
    access_scope: "none",
    note: scope.reason || CHAT_SCOPE_NOTES.notStaff,
  };
}

/** Extra result fields that tell Carmen her view was narrowed. */
export function chatScopeMeta(scope: ChatScope): Record<string, string> {
  if (scope.mode === "group")
    return { access_scope: "group", access_note: CHAT_SCOPE_NOTES.group };
  if (scope.mode === "staff")
    return {
      access_scope: "staff",
      access_note: scope.ownThread
        ? CHAT_SCOPE_NOTES.staffWithOwnChat
        : CHAT_SCOPE_NOTES.staff,
    };
  return {};
}

async function rows(query: any): Promise<any[]> {
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * The get_chat_contacts connection rule, from the database. Fails closed: on
 * error the caller sees no green_api rows.
 */
export async function allowedConnectionUserIds(
  supabase: any,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc(
      "chat_allowed_connection_user_ids",
      { p_tenant_id: tenantId, p_user_id: userId },
    );
    if (error) throw error;
    return uuids(Array.isArray(data) ? data : []);
  } catch (e: any) {
    console.warn(
      "[chat-scope] chat_allowed_connection_user_ids failed; hiding green_api rows:",
      e?.message || e,
    );
    return [];
  }
}

async function linkedGroupIdsFor(
  supabase: any,
  clientIds: "all" | string[],
  tenantIds: string[],
): Promise<string[]> {
  if (clientIds !== "all" && clientIds.length === 0) return [];
  const byClient = (q: any, column: string) =>
    clientIds === "all" ? q : q.in(column, clientIds);
  const [fromClients, fromChannels, fromCarmen] = await Promise.all([
    rows(
      byClient(
        supabase
          .from("clients")
          .select("whatsapp_group_id")
          .in("tenant_id", tenantIds)
          .not("whatsapp_group_id", "is", null),
        "id",
      ),
    ),
    rows(
      byClient(
        supabase
          .from("team_channel_whatsapp_links")
          .select("whatsapp_group_id")
          .in("tenant_id", tenantIds)
          .not("client_id", "is", null)
          .not("whatsapp_group_id", "is", null),
        "client_id",
      ),
    ),
    rows(
      byClient(
        supabase
          .from("carmen_client_group_access")
          .select("whatsapp_group_id")
          .in("tenant_id", tenantIds),
        "client_id",
      ),
    ),
  ]);
  return uuids(
    [...fromClients, ...fromChannels, ...fromCarmen].map(
      (r: any) => r.whatsapp_group_id,
    ),
  );
}

/**
 * The user's highest role in this tenant, counting global (tenant_id null)
 * roles too, as resolveDirectCaller in run-ai-agent does. A role the user
 * holds in another tenant never counts.
 */
export async function tenantRoleFor(
  supabase: any,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const tenant = asUuidOrNull(tenantId);
  const user = asUuidOrNull(userId);
  if (!tenant || !user) return null;
  const found = await rows(
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user)
      .or(`tenant_id.eq.${tenant},tenant_id.is.null`),
  );
  const roles = found.map((r: any) => String(r.role));
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
}

async function managedAgencyIdsFor(
  supabase: any,
  userId: string,
): Promise<string[]> {
  const found = await rows(
    supabase
      .from("user_managed_agencies")
      .select("agency_id")
      .eq("user_id", userId),
  );
  return uuids(found.map((r: any) => r.agency_id));
}

/**
 * Builds the caller's chat scope. Only the verified caller and the WhatsApp
 * chat of the turn go in; tool arguments never do.
 */
export async function resolveChatScope(
  supabase: any,
  input: ChatScopeInput,
): Promise<ChatScope> {
  const userId = asUuidOrNull(input.userId);
  const role = userId
    ? await tenantRoleFor(supabase, input.tenantId, userId)
    : null;
  const tier = chatRoleTier(role, input.callerCampaignerId);
  if (tier === "full") return FULL_CHAT_SCOPE;
  const tenantIds = uuids(
    input.accessibleTenantIds?.length
      ? input.accessibleTenantIds
      : [input.tenantId],
  );

  if (isGroupTurn(input.waNotify)) {
    const chatId = String(input.waNotify?.chat_id || "");
    const { data: group } = await supabase
      .from("whatsapp_groups")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("group_chat_id", chatId)
      .maybeSingle();
    const groupId = asUuidOrNull(group?.id);
    if (!groupId) return noneScope(CHAT_SCOPE_NOTES.groupNotFound);
    return {
      ...emptyScope("group"),
      groupId,
      connectionUserIds:
        tier && userId
          ? await allowedConnectionUserIds(supabase, input.tenantId, userId)
          : [],
    };
  }

  if (!tier) return noneScope(CHAT_SCOPE_NOTES.notStaff);

  const connectionUserIds = userId
    ? await allowedConnectionUserIds(supabase, input.tenantId, userId)
    : [];

  let clientIds: "all" | string[];
  let leads: LeadScope;
  if (tier === "tenant") {
    clientIds = "all";
    leads = { all: true, agencyIds: [], salesPersonId: null };
  } else {
    const { data: profile } = userId
      ? await supabase
          .from("profiles")
          .select("campaigner_id, sales_person_id")
          .eq("id", userId)
          .maybeSingle()
      : { data: null };
    const campaignerId =
      asUuidOrNull(input.callerCampaignerId) ||
      asUuidOrNull(profile?.campaigner_id);
    const today = input.today || israelToday();
    const ownClients = campaignerId
      ? (
          await rows(
            supabase
              .from("client_team")
              .select("client_id, start_date, end_date")
              .eq("campaigner_id", campaignerId),
          )
        )
          .filter((r: any) => isActiveAssignment(r, today))
          .map((r: any) => r.client_id)
      : [];
    // Agencies live in one tenant; the clients and leads checks below are
    // tenant-filtered, so another tenant's agencies match nothing here.
    const agencyIds =
      tier === "team" && userId
        ? await managedAgencyIdsFor(supabase, userId)
        : [];
    const agencyClients = agencyIds.length
      ? (
          await rows(
            supabase
              .from("clients")
              .select("id")
              .in("tenant_id", tenantIds)
              .in("agency_id", agencyIds),
          )
        ).map((r: any) => r.id)
      : [];
    clientIds = uuids([...ownClients, ...agencyClients]);
    leads = {
      all: false,
      agencyIds,
      salesPersonId:
        role === "sales_person" ? asUuidOrNull(profile?.sales_person_id) : null,
    };
  }

  const linkedGroupIds = await linkedGroupIdsFor(
    supabase,
    clientIds,
    tenantIds,
  );

  let ownThread: ChatScope["ownThread"] = null;
  const tail = input.waNotify ? phoneTail(input.waNotify.chat_id) : "";
  if (tail) {
    ownThread = {
      phoneTail: tail,
      connectionUserId: asUuidOrNull(input.waNotify?.connection_user_id),
    };
  }

  return {
    ...emptyScope("staff"),
    connectionUserIds,
    clientIds,
    leads,
    linkedGroupIds,
    ownThread,
  };
}

/** Keeps only the rows the scope allows (loads lead owners when needed). */
export async function keepVisibleChatRows<T extends ChatScopeRow>(
  supabase: any,
  data: T[] | null | undefined,
  scope: ChatScope,
  tenantIds: string[],
): Promise<T[]> {
  const list = Array.isArray(data) ? data : [];
  if (scope.mode === "full") return list;
  let owners: Map<string, LeadOwner> | null = null;
  if (
    scope.mode === "staff" &&
    !scope.leads.all &&
    hasLeadAccess(scope.leads)
  ) {
    const leadIds = uuids(list.map((r) => r.lead_id));
    if (leadIds.length) {
      const found = await rows(
        supabase
          .from("leads")
          .select("id, agency_id, sales_person_id")
          .in("tenant_id", tenantIds)
          .in("id", leadIds),
      );
      owners = new Map(found.map((l: any) => [String(l.id).toLowerCase(), l]));
    }
  }
  return list.filter((row) =>
    isChatRowVisible(
      {
        ...row,
        lead_id: row.lead_id ? String(row.lead_id).toLowerCase() : null,
      },
      scope,
      owners,
    ),
  );
}

/**
 * get_chat_history asks for one contact by id. Returns a refusal when the
 * contact is outside a staff caller's scope, or null to go ahead.
 */
export async function chatContactRefusal(
  supabase: any,
  scope: ChatScope,
  contactType: unknown,
  contactId: unknown,
  tenantIds: string[],
): Promise<Record<string, unknown> | null> {
  if (scope.mode !== "staff") return null;
  const id = asUuidOrNull(contactId);
  const refuse = (note: string) => ({
    count: 0,
    messages: [],
    error: "access_denied",
    access_scope: "staff",
    note,
  });
  if (contactType === "client") {
    if (scope.clientIds === "all") return null;
    return id && scope.clientIds.includes(id.toLowerCase())
      ? null
      : refuse(CHAT_SCOPE_NOTES.clientOutOfScope);
  }
  if (scope.leads.all) return null;
  if (!id || !hasLeadAccess(scope.leads))
    return refuse(CHAT_SCOPE_NOTES.leadOutOfScope);
  const { data: lead } = await supabase
    .from("leads")
    .select("agency_id, sales_person_id")
    .eq("id", id)
    .in("tenant_id", tenantIds)
    .maybeSingle();
  return leadInScope(lead, scope.leads)
    ? null
    : refuse(CHAT_SCOPE_NOTES.leadOutOfScope);
}
