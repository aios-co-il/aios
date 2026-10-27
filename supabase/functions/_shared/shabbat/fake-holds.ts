// In-memory stand-in for the Supabase client, for the Deno tests of the
// Shabbat hold (trigger-automation) and its release (task-notification-worker).

type Row = Record<string, unknown>;
type Tables = { tasks?: Row[]; clients?: Row[]; agency_tenant_access?: Row[] };
type Result = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

/** The builder calls the hold and release paths make. */
export type FakeHoldsQuery = {
  select: () => FakeHoldsQuery;
  is: (col: string, val: unknown) => FakeHoldsQuery;
  eq: (col: string, val: unknown) => FakeHoldsQuery;
  lte: (col: string, val: string) => FakeHoldsQuery;
  order: () => FakeHoldsQuery;
  limit: (n: number) => FakeHoldsQuery;
  update: (values: Row) => FakeHoldsQuery;
  insert: (row: Row) => Promise<Result>;
  maybeSingle: () => Promise<Result>;
  then: (resolve: (value: Result) => void) => void;
};

/** A peer notification as the app sends it, plus one field that is dropped. */
export const PEER_UPDATE = {
  trigger_type: "task_update_added",
  tenant_id: "t1",
  data: {
    task_id: "task-1",
    user_id: "u1",
    update_content: "הלקוח אישר את הקריאייטיב",
    updater_name: "דוד",
    unexpected: "dropped",
  },
};

/**
 * task_notification_holds in memory, with the open-key unique index, plus the
 * tasks/clients rows the tenant check reads. `faults` makes the claim
 * (update…maybeSingle) or the release_result write (update…eq) fail.
 */
export function fakeHolds(
  tables: Tables = {
    tasks: [{ id: "task-1", tenant_id: "t1", client_id: null }],
  },
  faults: { claim?: string; record?: string } = {},
) {
  const rows: Row[] = [];
  let nextId = 1;
  const sourceOf = (table: string): Row[] => {
    if (table === "task_notification_holds") {
      return rows;
    }
    if (
      table === "tasks" ||
      table === "clients" ||
      table === "agency_tenant_access"
    ) {
      return tables[table] ?? [];
    }
    return [];
  };
  const from = (table: string): FakeHoldsQuery => {
    const source = sourceOf(table);
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    let limit = Infinity;
    const matching = () => source.filter((row) => filters.every((f) => f(row)));
    const builder: FakeHoldsQuery = {
      select: () => builder,
      is: (col, val) => (
        filters.push((row) => (row[col] ?? null) === val),
        builder
      ),
      eq: (col, val) => (filters.push((row) => row[col] === val), builder),
      lte: (col, val) => (
        filters.push((row) => {
          const value = row[col];
          return typeof value === "string" && value <= val;
        }),
        builder
      ),
      order: () => builder,
      limit: (n) => ((limit = n), builder),
      update: (values) => ((patch = values), builder),
      insert: async (row) => {
        const clash = rows.some(
          (other) =>
            other.released_at == null &&
            other.task_id === row.task_id &&
            other.notification_type === row.notification_type &&
            other.hold_key === row.hold_key,
        );
        if (clash) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        rows.push({ id: `h${nextId++}`, released_at: null, ...row });
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (patch && faults.claim) {
          return { data: null, error: { message: faults.claim } };
        }
        const hit = matching()[0] || null;
        if (hit && patch) {
          Object.assign(hit, patch);
        }
        return { data: hit, error: null };
      },
      then: (resolve) => {
        if (patch && faults.record) {
          return resolve({ data: null, error: { message: faults.record } });
        }
        const hits = matching().slice(0, limit);
        if (patch) {
          for (const hit of hits) {
            Object.assign(hit, patch);
          }
        }
        resolve({ data: hits, error: null });
      },
    };
    return builder;
  };
  return { from, rows };
}
