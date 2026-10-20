// Audience resolution for the mailing (broadcast) module.
//
// Used by broadcast-enqueue (send snapshot + dry-run preview) and
// broadcast-list-materialize (CRM-filter list preview / freeze). The `db`
// client decides visibility: a user-scoped client respects RLS, a service
// client is trusted and must always be paired with an explicit tenantId.
//
// AudienceFilter (broadcasts.audience_filter, broadcast_lists.source_config):
//   source: 'clients'|'leads'|'campaigners'|'list'|'wa_groups'
//   leads:   stageKeys/stageMode (leads.status), statusKeys/statusMode
//            (response_status), salesPersonIds, agencyIds, tagIds/tagMode
//   clients: statuses/statusMode, serviceTags, agencyIds, campaignerIds
//            (client_team), tagIds/tagMode
//   campaigners: roles, activeOnly
//   list: listId (static members, or a dynamic CRM-filter list's filter)
//   wa_groups: groupIds
//   includeIds / excludeIds: manual pick within a source
import {
  buildTemplateVars,
  normalizePhone,
  type TemplateVars,
} from "./broadcast-template.ts";

export type AudienceFilter = {
  source: "clients" | "leads" | "campaigners" | "list" | "wa_groups";
  statuses?: string[];
  statusMode?: "include" | "exclude";
  serviceTags?: string[];
  statusKeys?: string[];
  stageKeys?: string[];
  stageMode?: "include" | "exclude";
  salesPersonIds?: string[];
  agencyIds?: string[];
  campaignerIds?: string[];
  tagIds?: string[];
  tagMode?: "include" | "exclude";
  roles?: string[];
  activeOnly?: boolean;
  listId?: string;
  groupIds?: string[];
  includeIds?: string[];
  excludeIds?: string[];
};

export type Recipient = {
  entity_type: "client" | "lead" | "campaigner" | "manual" | "wa_group";
  entity_id: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  group_chat_id?: string | null;
  vars: TemplateVars;
};

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  paused: "מושהה",
  ended: "הסתיים",
  onboarding: "בקליטה",
  inactive: "לא פעיל",
};

const PAGE = 1000;
const IN_CHUNK = 200;

// deno-lint-ignore no-explicit-any
type Db = any;

/** Page through a PostgREST query builder factory (default max_rows is 1000). */
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function fetchByIds<T>(
  db: Db,
  table: string,
  columns: string,
  ids: string[],
  column = "id",
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .in(column, unique.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data || []) as T[]));
  }
  return out;
}

const hasItems = (a: unknown): a is string[] =>
  Array.isArray(a) && a.length > 0;

function modeMatch(
  values: string[] | undefined,
  mode: string | undefined,
  current: string | null | undefined,
): boolean {
  if (!hasItems(values)) return true;
  const hit = values.includes(current ?? "");
  return mode === "exclude" ? !hit : hit;
}

/** Labels and names used to fill merge fields; loaded once per resolution. */
type Lookups = {
  stages: Map<string, string>;
  statuses: Map<string, string>;
  agencies: Map<string, string>;
  salesPeople: Map<string, string>;
  campaigners: Map<string, string>;
  clientCampaigner: Map<string, string>; // client_id → campaigner name
};

async function loadLookups(
  db: Db,
  tenantId: string,
  clientIds: string[],
): Promise<Lookups> {
  const [stages, statuses, agencies, salesPeople, campaigners] =
    await Promise.all([
      db
        .from("lead_pipeline_stages")
        .select("stage_key, label")
        .eq("tenant_id", tenantId),
      db
        .from("lead_statuses")
        .select("status_key, label")
        .eq("tenant_id", tenantId),
      db.from("agencies").select("id, name").eq("tenant_id", tenantId),
      db.from("sales_people").select("id, full_name").eq("tenant_id", tenantId),
      db.from("campaigners").select("id, full_name").eq("tenant_id", tenantId),
    ]);
  const campaignerNames = new Map<string, string>(
    (campaigners.data || []).map((c: Db) => [c.id, c.full_name]),
  );
  const clientCampaigner = new Map<string, string>();
  if (clientIds.length > 0) {
    const team = await fetchByIds<Db>(
      db,
      "client_team",
      "client_id, campaigner_id, end_date",
      clientIds,
      "client_id",
    );
    const today = new Date().toISOString().slice(0, 10);
    for (const t of team) {
      if (t.end_date && t.end_date < today) continue;
      const name = campaignerNames.get(t.campaigner_id);
      if (!name) continue;
      const prev = clientCampaigner.get(t.client_id);
      clientCampaigner.set(t.client_id, prev ? `${prev}, ${name}` : name);
    }
  }
  return {
    stages: new Map((stages.data || []).map((s: Db) => [s.stage_key, s.label])),
    statuses: new Map(
      (statuses.data || []).map((s: Db) => [s.status_key, s.label]),
    ),
    agencies: new Map((agencies.data || []).map((a: Db) => [a.id, a.name])),
    salesPeople: new Map(
      (salesPeople.data || []).map((s: Db) => [s.id, s.full_name]),
    ),
    campaigners: campaignerNames,
    clientCampaigner,
  };
}

function flatObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

const LEAD_COLUMNS =
  "id, contact_name, company_name, phone, email, status, response_status, sales_person_id, agency_id, form_data";
const CLIENT_COLUMNS =
  "id, contact_name, name, phone, email, status, services, agency_id";

function leadRecipient(
  l: Db,
  lk: Lookups,
  extra: Record<string, unknown> = {},
): Recipient {
  return {
    entity_type: "lead",
    entity_id: l.id,
    phone: l.phone || null,
    email: l.email || null,
    contact_name: l.contact_name || l.company_name || null,
    vars: buildTemplateVars({
      contact_name: l.contact_name,
      company_name: l.company_name,
      email: l.email,
      phone: l.phone,
      agency_name: lk.agencies.get(l.agency_id),
      sales_person_name: lk.salesPeople.get(l.sales_person_id),
      lead_stage: lk.stages.get(l.status) ?? l.status,
      lead_status: lk.statuses.get(l.response_status) ?? l.response_status,
      extra: { ...flatObject(l.form_data), ...extra },
    }),
  };
}

function clientRecipient(
  c: Db,
  lk: Lookups,
  extra: Record<string, unknown> = {},
): Recipient {
  return {
    entity_type: "client",
    entity_id: c.id,
    phone: c.phone || null,
    email: c.email || null,
    contact_name: c.contact_name || c.name || null,
    vars: buildTemplateVars({
      contact_name: c.contact_name || c.name,
      company_name: c.name,
      email: c.email,
      phone: c.phone,
      agency_name: lk.agencies.get(c.agency_id),
      campaigner_name: lk.clientCampaigner.get(c.id),
      client_status: CLIENT_STATUS_LABELS[c.status] ?? c.status,
      extra,
    }),
  };
}

async function tagFilteredIds(
  db: Db,
  tenantId: string,
  filter: AudienceFilter,
  col: "client_id" | "lead_id",
): Promise<Set<string> | null> {
  if (!hasItems(filter.tagIds)) return null;
  const rows = await fetchAll<Db>(() =>
    db
      .from("chat_contact_tags")
      .select(col)
      .eq("tenant_id", tenantId)
      .in("tag_id", filter.tagIds)
      .not(col, "is", null),
  );
  return new Set(rows.map((r: Db) => r[col]).filter(Boolean));
}

function applyTagFilter<T extends { id: string }>(
  rows: T[],
  tagged: Set<string> | null,
  mode: string | undefined,
): T[] {
  if (!tagged) return rows;
  return rows.filter((r) =>
    mode === "exclude" ? !tagged.has(r.id) : tagged.has(r.id),
  );
}

async function resolveLeads(db: Db, tenantId: string, f: AudienceFilter) {
  let rows = await fetchAll<Db>(() => {
    let q = db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (hasItems(f.salesPersonIds))
      q = q.in("sales_person_id", f.salesPersonIds);
    if (hasItems(f.agencyIds)) q = q.in("agency_id", f.agencyIds);
    return q;
  });
  rows = rows.filter(
    (l: Db) =>
      modeMatch(f.stageKeys, f.stageMode, l.status) &&
      modeMatch(f.statusKeys, f.statusMode, l.response_status),
  );
  rows = applyTagFilter(
    rows,
    await tagFilteredIds(db, tenantId, f, "lead_id"),
    f.tagMode,
  );
  const lk = await loadLookups(db, tenantId, []);
  return rows.map((l: Db) => leadRecipient(l, lk));
}

async function resolveClients(db: Db, tenantId: string, f: AudienceFilter) {
  let rows = await fetchAll<Db>(() => {
    let q = db
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (hasItems(f.agencyIds)) q = q.in("agency_id", f.agencyIds);
    return q;
  });
  rows = rows.filter((c: Db) => modeMatch(f.statuses, f.statusMode, c.status));
  if (hasItems(f.serviceTags)) {
    rows = rows.filter((c: Db) =>
      (Array.isArray(c.services) ? c.services : []).some((s: string) =>
        f.serviceTags!.includes(s),
      ),
    );
  }
  if (hasItems(f.campaignerIds)) {
    const team = await fetchByIds<Db>(
      db,
      "client_team",
      "client_id, end_date",
      f.campaignerIds,
      "campaigner_id",
    );
    const today = new Date().toISOString().slice(0, 10);
    const allowed = new Set(
      team
        .filter((t: Db) => !t.end_date || t.end_date >= today)
        .map((t: Db) => t.client_id),
    );
    rows = rows.filter((c: Db) => allowed.has(c.id));
  }
  rows = applyTagFilter(
    rows,
    await tagFilteredIds(db, tenantId, f, "client_id"),
    f.tagMode,
  );
  const lk = await loadLookups(
    db,
    tenantId,
    rows.map((c: Db) => c.id),
  );
  return rows.map((c: Db) => clientRecipient(c, lk));
}

async function resolveCampaigners(db: Db, tenantId: string, f: AudienceFilter) {
  let q = db
    .from("campaigners")
    .select("id, full_name, phone, email, role, active")
    .eq("tenant_id", tenantId);
  if (f.activeOnly !== false) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || [])
    .filter((c: Db) =>
      hasItems(f.roles)
        ? (Array.isArray(c.role) ? c.role : []).some((r: string) =>
            f.roles!.includes(r),
          )
        : true,
    )
    .map((c: Db): Recipient => ({
      entity_type: "campaigner",
      entity_id: c.id,
      phone: c.phone || null,
      email: c.email || null,
      contact_name: c.full_name || null,
      vars: buildTemplateVars({
        contact_name: c.full_name,
        email: c.email,
        phone: c.phone,
      }),
    }));
}

/** Static list members, enriched with their lead/client data when linked. */
async function resolveStaticList(db: Db, tenantId: string, listId: string) {
  const members = await fetchAll<Db>(() =>
    db
      .from("broadcast_list_members")
      .select("entity_type, entity_id, name, phone, email, custom_fields")
      .eq("tenant_id", tenantId)
      .eq("list_id", listId)
      .order("created_at", { ascending: true }),
  );
  const leadIds = members
    .filter((m: Db) => m.entity_type === "lead" && m.entity_id)
    .map((m: Db) => m.entity_id);
  const clientIds = members
    .filter((m: Db) => m.entity_type === "client" && m.entity_id)
    .map((m: Db) => m.entity_id);
  const [leads, clients] = await Promise.all([
    leadIds.length
      ? fetchByIds<Db>(db, "leads", LEAD_COLUMNS, leadIds)
      : Promise.resolve([]),
    clientIds.length
      ? fetchByIds<Db>(db, "clients", CLIENT_COLUMNS, clientIds)
      : Promise.resolve([]),
  ]);
  const lk = await loadLookups(db, tenantId, clientIds);
  const leadMap = new Map(leads.map((l: Db) => [l.id, l]));
  const clientMap = new Map(clients.map((c: Db) => [c.id, c]));

  return members.map((m: Db): Recipient => {
    const custom = flatObject(m.custom_fields);
    const lead = m.entity_type === "lead" ? leadMap.get(m.entity_id) : null;
    const client =
      m.entity_type === "client" ? clientMap.get(m.entity_id) : null;
    // The list row's phone/email win: that is the address the member was added with.
    const base = lead
      ? leadRecipient(lead, lk, custom)
      : client
        ? clientRecipient(client, lk, custom)
        : null;
    const contact = m.name || base?.contact_name || null;
    return {
      entity_type: (m.entity_type || "manual") as Recipient["entity_type"],
      entity_id: m.entity_id || null,
      phone: m.phone || base?.phone || null,
      email: m.email || base?.email || null,
      contact_name: contact,
      vars: {
        ...(base?.vars ||
          buildTemplateVars({
            contact_name: contact,
            email: m.email,
            phone: m.phone,
            extra: custom,
          })),
        ...(m.phone ? { phone: m.phone } : {}),
        ...(m.email ? { email: m.email } : {}),
      },
    };
  });
}

async function resolveWaGroups(db: Db, tenantId: string, f: AudienceFilter) {
  if (!hasItems(f.groupIds)) throw new Error("missing_groupIds");
  const { data, error } = await db
    .from("whatsapp_groups")
    .select("id, group_name, group_chat_id")
    .eq("tenant_id", tenantId)
    .in("id", f.groupIds);
  if (error) throw error;
  return (data || []).map((g: Db): Recipient => ({
    entity_type: "wa_group",
    entity_id: g.id,
    phone: null,
    email: null,
    contact_name: g.group_name || null,
    group_chat_id: g.group_chat_id || null,
    vars: buildTemplateVars({ contact_name: g.group_name }),
  }));
}

/** Resolve a filter to raw recipients (before reachability / opt-outs). */
export async function resolveAudience(
  db: Db,
  tenantId: string,
  filter: AudienceFilter,
  depth = 0,
): Promise<Recipient[]> {
  if (!filter?.source) throw new Error("missing_filter_source");
  let recipients: Recipient[];
  switch (filter.source) {
    case "leads":
      recipients = await resolveLeads(db, tenantId, filter);
      break;
    case "clients":
      recipients = await resolveClients(db, tenantId, filter);
      break;
    case "campaigners":
      recipients = await resolveCampaigners(db, tenantId, filter);
      break;
    case "wa_groups":
      return resolveWaGroups(db, tenantId, filter);
    case "list": {
      if (!filter.listId) throw new Error("missing_listId");
      const { data: list, error } = await db
        .from("broadcast_lists")
        .select("id, source, source_config, kind")
        .eq("tenant_id", tenantId)
        .eq("id", filter.listId)
        .maybeSingle();
      if (error) throw error;
      if (!list) throw new Error("list_not_found");
      const cfg = list.source_config as AudienceFilter | null;
      // Dynamic CRM-filter lists are resolved live; never nest list → list.
      if (
        list.source === "crm_filter" &&
        list.kind === "dynamic" &&
        cfg?.source &&
        cfg.source !== "list"
      ) {
        if (depth > 0) throw new Error("nested_list");
        recipients = await resolveAudience(db, tenantId, cfg, depth + 1);
      } else {
        recipients = await resolveStaticList(db, tenantId, filter.listId);
      }
      break;
    }
    default:
      throw new Error("unknown_source");
  }

  if (hasItems(filter.includeIds)) {
    const inc = new Set(filter.includeIds);
    recipients = recipients.filter((r) => r.entity_id && inc.has(r.entity_id));
  }
  if (hasItems(filter.excludeIds)) {
    const exc = new Set(filter.excludeIds);
    recipients = recipients.filter(
      (r) => !r.entity_id || !exc.has(r.entity_id),
    );
  }
  return recipients;
}

/**
 * Keep recipients reachable on the channel, normalize + dedupe addresses and
 * drop opt-outs. Email recipients are returned without phone (the phone stays
 * in vars) so the per-broadcast email unique index applies.
 */
export async function filterReachable(
  db: Db,
  tenantId: string,
  channel: string,
  recipients: Recipient[],
): Promise<Recipient[]> {
  const seen = new Set<string>();
  const deduped: Recipient[] = [];
  for (const r of recipients) {
    if (r.entity_type === "wa_group") {
      const key = `g:${r.group_chat_id || r.entity_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
      continue;
    }
    if (channel === "email") {
      const email = (r.email || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      deduped.push({ ...r, email, phone: null });
    } else {
      const phone = normalizePhone(r.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      deduped.push({ ...r, phone });
    }
  }

  const optOuts = await fetchAll<Db>(() =>
    db
      .from("broadcast_opt_outs")
      .select("phone, email, channel")
      .eq("tenant_id", tenantId)
      .in("channel", [channel, "all"]),
  );
  const optPhones = new Set(optOuts.map((o: Db) => o.phone).filter(Boolean));
  const optEmails = new Set(
    optOuts.map((o: Db) => (o.email || "").toLowerCase()).filter(Boolean),
  );
  return deduped.filter((r) => {
    if (r.entity_type === "wa_group") return true;
    return channel === "email"
      ? !optEmails.has(r.email || "")
      : !optPhones.has(r.phone || "");
  });
}

/** Is this address opted out on the channel? Used for single sends. */
export async function isOptedOut(
  db: Db,
  tenantId: string,
  channel: string,
  address: { phone?: string | null; email?: string | null },
): Promise<boolean> {
  let q = db
    .from("broadcast_opt_outs")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("channel", [channel, "all"])
    .limit(1);
  if (channel === "email") {
    if (!address.email) return false;
    q = q.eq("email", address.email.toLowerCase());
  } else {
    const phone = normalizePhone(address.phone);
    if (!phone) return false;
    q = q.eq("phone", phone);
  }
  const { data } = await q;
  return (data || []).length > 0;
}

/** Build recipient vars for a single lead / client (automation triggers). */
export async function recipientForEntity(
  db: Db,
  tenantId: string,
  entityType: "lead" | "client",
  entityId: string,
): Promise<Recipient | null> {
  const table = entityType === "lead" ? "leads" : "clients";
  const cols = entityType === "lead" ? LEAD_COLUMNS : CLIENT_COLUMNS;
  const { data, error } = await db
    .from(table)
    .select(cols)
    .eq("tenant_id", tenantId)
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lk = await loadLookups(
    db,
    tenantId,
    entityType === "client" ? [entityId] : [],
  );
  return entityType === "lead"
    ? leadRecipient(data, lk)
    : clientRecipient(data, lk);
}
