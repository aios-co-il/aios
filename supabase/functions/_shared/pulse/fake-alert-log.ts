/**
 * In-memory stand-in for the Supabase client, for the Deno tests of pulse
 * instant alerts: pulse_instant_alert_log, agency_tenant_access and, when a
 * test seeds them, user_roles and profiles.
 */
import {
  DEFAULT_PULSE_ALERT_RULES,
  deliverInstantPulseAlerts,
  type PulseSnapshotAlertInput,
} from "../pulse-instant-alerts.ts";

type Row = Record<string, unknown>;

type Result =
  { data: Row[]; error: null } | { data: null; error: { message: string } };

/** The builder calls deliverInstantPulseAlerts makes. */
type FakeQuery = {
  select: () => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  in: (col: string, vals: unknown[]) => FakeQuery;
  or: (filter: string) => FakeQuery;
  gte: (col: string, val: string) => FakeQuery;
  order: (col: string, opts?: { ascending?: boolean }) => FakeQuery;
  limit: (n: number) => FakeQuery;
  insert: (row: Row) => Promise<{ error: { message: string } | null }>;
  then: (resolve: (value: Result) => void) => void;
};

type DeliverInput = Parameters<typeof deliverInstantPulseAlerts>[0];

export const ACME: PulseSnapshotAlertInput = {
  client_id: "c1",
  client_name: "Acme",
  status: "warning",
  flags: ["סנכרון ישן: Meta"],
  last_client_call_at: null,
};

export const WEDNESDAY = new Date("2026-10-28T07:00:00Z"); // 09:00 Israel

/** Pulse rules without no_contact, so a run checks the other rules alone. */
export const NO_CONTACT_OFF = {
  ...DEFAULT_PULSE_ALERT_RULES,
  no_contact_enabled: false,
};

/** Client c1, contacted on WEDNESDAY, with these snapshot flags. */
export const healthy = (flags: string[] = []): PulseSnapshotAlertInput => ({
  client_id: "c1",
  client_name: "Acme",
  status: "warning",
  flags,
  last_client_call_at: WEDNESDAY.toISOString(),
});

/**
 * pulse_instant_alert_log, agency_tenant_access `grants` and the staff tables
 * (user_roles `roles`, profiles) in memory; inserts are stamped with `clock`.
 * Every read of a `failing` table and every insert into a `failingInserts`
 * table returns an error.
 */
export function fakeSupabase(
  log: Row[] = [],
  options: {
    grants?: Row[];
    roles?: Row[];
    profiles?: Row[];
    failing?: string[];
    failingInserts?: string[];
  } = {},
) {
  const db: Record<string, Row[]> = {
    pulse_instant_alert_log: log,
    agency_tenant_access: options.grants ?? [],
    user_roles: options.roles ?? [],
    profiles: options.profiles ?? [],
  };
  const fake = { from, log, clock: "" };
  function from(table: string): FakeQuery {
    const filters: Array<(row: Row) => boolean> = [];
    let limit = Infinity;
    let descending = false;
    const builder: FakeQuery = {
      select: () => builder,
      eq: (col, val) => (filters.push((row) => row[col] === val), builder),
      in: (col, vals) => (
        filters.push((row) => vals.includes(row[col])),
        builder
      ),
      // Only the `a.eq.x,b.eq.y` form the code under test sends.
      or: (filter) => {
        const terms = filter.split(",").map((term) => term.split(".eq."));
        filters.push((row) => terms.some(([col, val]) => row[col] === val));
        return builder;
      },
      gte: (col, val) => (
        filters.push((row) => {
          const value = row[col];
          return typeof value === "string" && value >= val;
        }),
        builder
      ),
      order: (_col, opts) => (
        (descending = opts?.ascending === false),
        builder
      ),
      limit: (n) => ((limit = n), builder),
      insert: async (row) => {
        if (options.failingInserts?.includes(table)) {
          return { error: { message: "connection reset" } };
        }
        (db[table] ||= []).push({ sent_at: fake.clock, ...row });
        return { error: null };
      },
      then: (resolve) => {
        if (options.failing?.includes(table)) {
          resolve({ data: null, error: { message: "connection reset" } });
          return;
        }
        const rows = (db[table] || []).filter((row) =>
          filters.every((f) => f(row)),
        );
        rows.sort((a, b) =>
          descending
            ? String(b.sent_at).localeCompare(String(a.sent_at))
            : String(a.sent_at).localeCompare(String(b.sent_at)),
        );
        resolve({ data: rows.slice(0, limit), error: null });
      },
    };
    return builder;
  }
  return fake;
}

/** One delivery run at `now`; returns the result and every queued WhatsApp. */
export async function run(
  supabase: ReturnType<typeof fakeSupabase>,
  now: Date,
  snapshots: PulseSnapshotAlertInput[] = [ACME],
  extra: Partial<DeliverInput> = {},
) {
  supabase.clock = now.toISOString();
  const sends: Array<{ message: string; phone: string | null }> = [];
  const result = await deliverInstantPulseAlerts({
    supabase,
    tenantId: "t1",
    tenantSlug: "test-tenant",
    pulsePhone: "0501234567",
    snapshots,
    criticalIssues: [],
    rules: DEFAULT_PULSE_ALERT_RULES,
    queueWhatsApp: async (message, phone) => (
      sends.push({ message, phone }),
      true
    ),
    now,
    ...extra,
  });
  return { result, sends };
}
