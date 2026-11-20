/**
 * The SEO read fake plus the writes the SEO actions make: insert (with
 * select().single()), upsert with ignoreDuplicates, and update filtered by eq.
 * Writes change the seed itself, so later reads see them, and are recorded.
 */
import { fakeSeoDb, seoCtx } from "../seo-read/fake-db.test-fixture.ts";
import type { SeoToolContext } from "../seo-read/context.ts";
import type { SeoActionContext } from "./context.ts";

export * from "../seo-read/seo-fixtures.test-fixture.ts";

type Row = Record<string, unknown>;
type Write = { table: string; op: string; rows: Array<Row> };
type Done = { data: unknown; error: { message: string } | null };

/** The fake; `failWrites` tables answer every write with a database error. */
export function fakeActionDb(
  seed: Record<string, Array<Row>>,
  failWrites: Array<string> = [],
) {
  const reader = fakeSeoDb(seed);
  const writes: Array<Write> = [];
  let nextId = 1;
  function failed(table: string): Done | null {
    return failWrites.includes(table)
      ? { data: null, error: { message: `${table} write failed` } }
      : null;
  }
  function insert(table: string, row: Row) {
    const done = (): Done => {
      const failure = failed(table);
      if (failure) {
        return failure;
      }
      const stored = { id: `${table}-${nextId++}`, ...row };
      (seed[table] ??= []).push(stored);
      writes.push({ table, op: "insert", rows: [stored] });
      return { data: stored, error: null };
    };
    return { select: () => ({ single: () => Promise.resolve(done()) }) };
  }
  function upsert(
    table: string,
    rows: Array<Row>,
    options: { onConflict: string },
  ) {
    const failure = failed(table);
    if (failure) {
      return Promise.resolve(failure);
    }
    const keys = options.onConflict.split(",");
    const fresh = rows.filter(
      (row) =>
        !(seed[table] ?? []).some((old) =>
          keys.every((k) => old[k] === row[k]),
        ),
    );
    const stored = fresh.map((row) => ({ id: `${table}-${nextId++}`, ...row }));
    (seed[table] ??= []).push(...stored);
    writes.push({ table, op: "upsert", rows: stored });
    return Promise.resolve({ data: null, error: null });
  }
  function update(table: string, patch: Row) {
    const filters: Array<[string, unknown]> = [];
    const chain = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return chain;
      },
      then(resolve: (done: Done) => unknown) {
        const failure = failed(table);
        if (failure) {
          return Promise.resolve(failure).then(resolve);
        }
        const matched = (seed[table] ?? []).filter((row) =>
          filters.every(([c, v]) => row[c] === v),
        );
        matched.forEach((row) => Object.assign(row, patch));
        writes.push({ table, op: "update", rows: matched });
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  }
  function from(table: string) {
    return Object.assign(reader.from(table), {
      insert: (row: Row) => insert(table, row),
      upsert: (rows: Array<Row>, options: { onConflict: string }) =>
        upsert(table, rows, options),
      update: (patch: Row) => update(table, patch),
    });
  }
  return { from, writes, reads: reader.reads };
}

/** A requester in the fixture tenant. */
export const REQUESTER = "66666666-6666-4666-8666-666666666666";

/** Calls the fake makes to other edge functions, and how they answer. */
export type Invocation = { fn: string; body: Record<string, unknown> };

/**
 * An action context for TENANT. `approved` runs instead of queueing; `replies`
 * answers invoked edge functions by name (default: ok, success).
 */
export function actionCtx(
  options: {
    approved?: boolean;
    actorUserId?: string | null;
    replies?: Record<
      string,
      { ok: boolean; status?: number; json: Record<string, unknown> }
    >;
    base?: SeoToolContext;
    /** Runs when an edge function is called, before it answers (its side effects). */
    onInvoke?: (fn: string) => void;
  } = {},
) {
  const invocations: Array<Invocation> = [];
  const ctx: SeoActionContext = {
    ...(options.base ?? seoCtx()),
    actorUserId:
      options.actorUserId === undefined ? REQUESTER : options.actorUserId,
    agentId: "agent-1",
    approved: options.approved === true,
    invoke: (fn, body) => {
      invocations.push({ fn, body });
      options.onInvoke?.(fn);
      const reply = options.replies?.[fn] ?? {
        ok: true,
        json: { success: true, ok: true },
      };
      return Promise.resolve({ status: reply.ok ? 200 : 500, ...reply });
    },
  };
  return { ctx, invocations };
}
