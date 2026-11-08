import { jerusalemDayStartIso, jerusalemYmd } from "../../calendarTimeZone.ts";
import type { DbClient } from "../../supabase-clients.ts";

/** One agency and the names of its current clients. */
export type BriefAgency = {
  name: string;
  /** Owned by another org that shared it with this one. */
  shared: boolean;
  clients: Array<string>;
};

/** A team member as the voice needs them: a name and roles. */
export type BriefMember = { name: string; roles: Array<string> };

/**
 * What Carmen knows when a call starts: the org's agencies with their clients, the team,
 * and what was said in today's conversations. Rebuilt on every call, so it is never stale.
 */
export type OrgBrief = {
  agencies: Array<BriefAgency>;
  /** Current clients that belong to no agency. */
  otherClients: Array<string>;
  team: Array<BriefMember>;
  /** Summaries of today's conversations (memory episodes since midnight in Israel). */
  today: Array<string>;
};

/**
 * Whose picture the brief shows. `org` is the whole org (managers, voice). A caller limited to
 * some agencies or clients gets only those, and none of today's org-wide conversation summaries.
 */
export type BriefScope =
  | { kind: "org" }
  | { kind: "agencies"; agencyIds: Array<string> }
  | { kind: "clients"; clientIds: Array<string> };

const WHOLE_ORG: BriefScope = { kind: "org" };

// Clients that are still worked with; "ended" ones stay out of the brief.
const CURRENT_CLIENT_STATUSES = ["active", "onboarding", "paused"] as const;
// Real orgs have up to ~200 clients and a dozen people; the caps keep the prompt short.
const MAX_CLIENTS = 400;
const MAX_TEAM = 60;
const MAX_TODAY = 12;
const MAX_SUMMARY_CHARS = 300;

const LOG = "[carmen-org-brief]";

/**
 * The tenant's brief, read with the service role and always filtered by the tenant (and the
 * agencies shared with it), the same org picture run-ai-agent gives the brain. Never throws:
 * a failed read leaves that part empty, so the call still starts.
 */
export async function loadOrgBrief(
  db: DbClient,
  tenantId: string,
  now: Date = new Date(),
  scope: BriefScope = WHOLE_ORG,
): Promise<OrgBrief> {
  const [ownAgencies, sharedAgencies, team, today] = await Promise.all([
    readRows("agencies", () =>
      db
        .from("agencies")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name"),
    ),
    readRows("agency_tenant_access", () =>
      db
        .from("agency_tenant_access")
        .select("agency_id, agencies(name)")
        .eq("accessing_tenant_id", tenantId),
    ),
    readRows("campaigners", () =>
      db
        .from("campaigners")
        .select("full_name, role")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("full_name")
        .limit(MAX_TEAM),
    ),
    readRows("carmen_memory_episodes", () =>
      db
        .from("carmen_memory_episodes")
        .select("summary")
        .eq("tenant_id", tenantId)
        .gte("ref_date", jerusalemDayStartIso(jerusalemYmd(now)))
        .order("ref_date", { ascending: true })
        .limit(MAX_TODAY),
    ),
  ]);
  const orgAgencies = [
    ...ownAgencies.map((a) => ({ id: a.id, name: a.name, shared: false })),
    ...sharedAgencies.map((s) => ({
      id: s.agency_id,
      name: s.agencies?.name ?? "סוכנות משותפת",
      shared: true,
    })),
  ];
  const clients = await readScopedClients(db, tenantId, orgAgencies, scope);
  const agencies = agenciesInScope(orgAgencies, clients, scope);
  return {
    agencies: agencies.map(({ id, name, shared }) => ({
      name,
      shared,
      clients: clients.filter((c) => c.agency_id === id).map((c) => c.name),
    })),
    otherClients: clients.filter((c) => !c.agency_id).map((c) => c.name),
    team: team.map((m) => ({ name: m.full_name, roles: m.role ?? [] })),
    today: (scope.kind === "org" ? today : [])
      .map((e) => firstLine(e.summary))
      .filter((s): s is string => Boolean(s)),
  };
}

/** The org's current clients the scope allows; a scope with no ids allows none. */
function readScopedClients(
  db: DbClient,
  tenantId: string,
  orgAgencies: Array<{ id: string; shared: boolean }>,
  scope: BriefScope,
): Promise<Array<{ name: string; agency_id: string | null }>> {
  const ids =
    scope.kind === "agencies"
      ? scope.agencyIds
      : scope.kind === "clients"
        ? scope.clientIds
        : null;
  if (ids && ids.length === 0) {
    return Promise.resolve([]);
  }
  return readRows("clients", () => {
    const query = db
      .from("clients")
      .select("name, agency_id")
      .or(
        clientScope(
          tenantId,
          orgAgencies.filter((a) => a.shared),
        ),
      )
      .in("status", CURRENT_CLIENT_STATUSES);
    const scoped = ids
      ? query.in(scope.kind === "agencies" ? "agency_id" : "id", ids)
      : query;
    return scoped.order("name").limit(MAX_CLIENTS);
  });
}

/** The whole org's agencies, those the scope names, or those holding the scope's clients. */
function agenciesInScope<A extends { id: string }>(
  orgAgencies: Array<A>,
  clients: Array<{ agency_id: string | null }>,
  scope: BriefScope,
): Array<A> {
  if (scope.kind === "org") {
    return orgAgencies;
  }
  const keep = new Set(
    scope.kind === "agencies"
      ? scope.agencyIds
      : clients.map((c) => c.agency_id),
  );
  return orgAgencies.filter((a) => keep.has(a.id));
}

/** The org's own clients, plus the clients of agencies another org shared with it. */
function clientScope(tenantId: string, shared: Array<{ id: string }>): string {
  const own = `tenant_id.eq.${tenantId}`;
  return shared.length === 0
    ? own
    : `${own},agency_id.in.(${shared.map((a) => a.id).join(",")})`;
}

/** Runs one read; on an error, logs it and returns no rows. */
async function readRows<T>(
  label: string,
  query: () => PromiseLike<{
    data: Array<T> | null;
    error: { message: string } | null;
  }>,
): Promise<Array<T>> {
  const { data, error } = await query();
  if (error) {
    console.error(`${LOG} org brief: ${label} read failed`, error.message);
    return [];
  }
  return data ?? [];
}

/** The summary's first line (the episode's one-line gist), shortened. */
function firstLine(summary: string | null): string | null {
  const line = summary?.split("\n")[0]?.trim();
  return line ? line.slice(0, MAX_SUMMARY_CHARS) : null;
}
