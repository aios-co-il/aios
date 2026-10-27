// In-memory stand-in for the Supabase client, for the Deno tests of pulse
// instant alerts: pulse_instant_alert_log, and no staff unless `tables` adds
// user_roles / user_managed_agencies / profiles rows.
import {
  DEFAULT_PULSE_ALERT_RULES,
  deliverInstantPulseAlerts,
  type InstantPulseAlertsInput,
  type PulseSnapshotAlertInput,
} from "../pulse-instant-alerts.ts";

type Row = Record<string, unknown>;
type Result = { data: Row[]; error: null };

/** The builder calls deliverInstantPulseAlerts makes. */
type FakeQuery = {
  select: () => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  in: (col: string, vals: unknown[]) => FakeQuery;
  gte: (col: string, val: string) => FakeQuery;
  order: (col: string, opts?: { ascending?: boolean }) => FakeQuery;
  limit: (n: number) => FakeQuery;
  insert: (row: Row) => Promise<{ error: { message: string } | null }>;
  then: (resolve: (value: Result) => void) => void;
};

type FakeClient = {
  from: (table: string) => FakeQuery;
  log: Row[];
  clock: string;
  insertError: string | null;
};

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
 * pulse_instant_alert_log in memory; inserts are stamped with `clock`, and
 * fail with `insertError` while it is set.
 */
export function fakeSupabase(
  log: Row[] = [],
  tables: Record<string, Row[]> = {},
) {
  const db: Record<string, Row[]> = { ...tables, pulse_instant_alert_log: log };
  const fake: FakeClient = { from, log, clock: "", insertError: null };
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
        if (fake.insertError) {
          return { error: { message: fake.insertError } };
        }

        (db[table] ||= []).push({ sent_at: fake.clock, ...row });
        return { error: null };
      },
      then: (resolve) => {
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
  extra: Partial<InstantPulseAlertsInput> = {},
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
