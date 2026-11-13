// In-memory stand-in for the supabase-js calls the meeting-bot finalize and its
// ingest claim make: select/update with eq/neq, single/maybeSingle. Updates
// apply to the stored rows, so a compare-and-swap behaves like it does in SQL.

import type { DbClient } from "../supabase-clients.ts";

export type Row = Record<string, unknown>;

export interface FakeCall {
  table: string;
  op: "select" | "update";
  values?: Row;
}

export interface FakeDb {
  tables: Record<string, Array<Row>>;
  calls: Array<FakeCall>;
  /** Runs after each query, to simulate a concurrent writer. */
  afterQuery?: (call: FakeCall) => void;
}

type Result = { data: unknown; error: { message: string } | null };

/** A fake database over `tables`. */
export function createFakeDb(tables: Record<string, Array<Row>>): FakeDb {
  return { tables, calls: [] };
}

/** A client over `db`; the cast is the test seam the finalize code accepts. */
export function fakeClient(db: FakeDb): DbClient {
  return {
    from: (table: string) => new FakeQuery(db, table),
  } as unknown as DbClient;
}

class FakeQuery implements PromiseLike<Result> {
  private op: FakeCall["op"] = "select";
  private values: Row | undefined;
  private predicates: Array<(row: Row) => boolean> = [];
  private mode: "many" | "maybe" | "one" = "many";
  private db: FakeDb;
  private table: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  // Column lists do not matter here: every query sees whole rows.
  select() {
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  // SQL `<>` never matches a null, and neither does this.
  neq(column: string, value: unknown) {
    this.predicates.push((row) => row[column] != null && row[column] !== value);
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  single() {
    this.mode = "one";
    return this;
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private run(): Result {
    const rows = (this.db.tables[this.table] ??= []);
    const matched = rows.filter((row) => this.predicates.every((p) => p(row)));
    if (this.op === "update") {
      matched.forEach((row) => Object.assign(row, this.values));
    }
    const call: FakeCall = {
      table: this.table,
      op: this.op,
      values: this.values,
    };
    this.db.calls.push(call);
    const copies = matched.map((row) => ({ ...row }));
    this.db.afterQuery?.(call);
    if (this.mode === "many") {
      return { data: copies, error: null };
    }
    if (this.mode === "one" && copies.length !== 1) {
      return {
        data: null,
        error: { message: `expected one row, got ${copies.length}` },
      };
    }
    return { data: copies[0] ?? null, error: null };
  }
}
