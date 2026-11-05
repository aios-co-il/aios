// The Supabase stand-in for the automatic-send tab's tests. Each test sets
// the card's permission, targets, switches and refusals in `backend`; a
// switch upsert is recorded and applied, and any RPC or table named in
// `failing` answers a database error.
import { vi } from "vitest";

type Row = Record<string, unknown>;

export type FakeAutoSendBackend = {
  canManage: boolean;
  card: Row;
  targets: {
    whatsapp_group: boolean;
    whatsapp_direct: boolean;
    email: boolean;
  };
  optIns: Row[];
  refusals: Row[];
  upsertError: { message: string } | null;
  /** RPCs and tables that answer a database error. */
  failing: string[];
  /** Holds the save until released, to look at the switch meanwhile. */
  upsertGate: Promise<void> | null;
  upsert: ReturnType<typeof vi.fn>;
};

export const backend: FakeAutoSendBackend = {
  canManage: true,
  card: {},
  targets: { whatsapp_group: false, whatsapp_direct: false, email: false },
  optIns: [],
  refusals: [],
  upsertError: null,
  failing: [],
  upsertGate: null,
  upsert: vi.fn(),
};

/** A manager's card with a group and a phone, no switch on, no refusal. */
export function resetBackend(): void {
  backend.canManage = true;
  backend.card = { tenant_id: "client-tenant" };
  backend.targets = {
    whatsapp_group: true,
    whatsapp_direct: true,
    email: false,
  };
  backend.optIns = [];
  backend.refusals = [];
  backend.upsertError = null;
  backend.failing = [];
  backend.upsertGate = null;
  backend.upsert.mockClear();
}

/** A refusal-log row of 27 October. */
export function refusalRow(id: string, reason: string, enforced: boolean) {
  return { id, reason, enforced, created_at: "2026-10-27T10:00:00Z" };
}

/** The supabase client the tab's hooks see. */
export const fakeSupabase = {
  rpc: (name: string) => fakeRpc(name),
  from: (table: string) => fakeTable(table),
};

/** The answer of an RPC or table, or its error when it is failing. */
function answerFor<T>(name: string, data: T) {
  return backend.failing.includes(name)
    ? { data: null, error: { message: `${name} failed` } }
    : { data, error: null };
}

/** An RPC answer, awaited directly or through maybeSingle. */
function fakeRpc(name: string) {
  const answers: Record<string, unknown> = {
    can_manage_client_auto_sends: backend.canManage,
    client_auto_send_targets: backend.targets,
  };
  const answer = answerFor(name, answers[name] ?? null);
  return {
    maybeSingle: async () => answer,
    then: (resolve: (value: typeof answer) => unknown) =>
      Promise.resolve(answer).then(resolve),
  };
}

/** A PostgREST builder that answers each table from `backend`. */
function fakeTable(table: string) {
  const rows: Record<string, Row[]> = {
    client_auto_send_opt_ins: backend.optIns,
    client_send_refusals: backend.refusals,
  };
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    order: () => query,
    limit: () => query,
    single: async () => answerFor(table, backend.card),
    upsert: async (row: Row, options: Row) => {
      backend.upsert(row, options);
      await backend.upsertGate;
      if (!backend.upsertError) {
        backend.optIns = [
          ...backend.optIns.filter(
            (saved) =>
              saved.send_kind !== row.send_kind || saved.target !== row.target,
          ),
          row,
        ];
      }
      return { error: backend.upsertError };
    },
    then: (resolve: (value: ReturnType<typeof answerFor>) => unknown) =>
      Promise.resolve(answerFor(table, rows[table] ?? [])).then(resolve),
  };
  return query;
}
