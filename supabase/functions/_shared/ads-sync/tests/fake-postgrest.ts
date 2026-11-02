/**
 * Minimal in-memory stand-in for the supabase-js query builder, for Deno tests.
 * Supports the calls the ads sync helpers make: select/insert/update/delete,
 * eq/in/gte/lte/or (with nested and()/or() and `data->>key` columns), order,
 * range and maybeSingle. Filters are evaluated like PostgREST does on text.
 */
import type { RecordsClient } from "../campaign-records.ts";
import { isRecord } from "../is-record.ts";
import type { SyncDbClient } from "../write-window.ts";

export type Row = Record<string, unknown> & { id?: string };
type Predicate = (row: Row) => boolean;
type Result = { data: unknown; error: { message: string } | null };

export type FakeDb = {
  tables: Record<string, Row[]>;
  calls: { table: string; op: string; filters: string[]; range?: number[] }[];
  /** Make the next matching operation fail: `${table}:${op}` -> message. */
  failures: Record<string, string>;
};

/** A client over `db` that fits both duck-typed clients the helpers take. */
export function fakeClient(db: FakeDb): SyncDbClient & RecordsClient {
  return { from: (table: string) => new Query(db, table) };
}

/** An empty call log and failure list over `tables`. */
export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  return { tables, calls: [], failures: {} };
}

/** Parse a PostgREST logic list (`a,b,and(c,or(d,e))`) joined by `mode`. */
function parseLogic(expr: string, mode: "or" | "and"): Predicate {
  const terms = splitTopLevel(expr).map((term): Predicate => {
    if (term.startsWith("or(")) {
      return parseLogic(term.slice(3, -1), "or");
    }
    if (term.startsWith("and(")) {
      return parseLogic(term.slice(4, -1), "and");
    }
    return condition(term);
  });
  return (row) =>
    mode === "or" ? terms.some((t) => t(row)) : terms.every((t) => t(row));
}

class Query implements PromiseLike<Result> {
  private op = "select";
  private values: Row = {};
  private rows: Row[] = [];
  private predicates: Predicate[] = [];
  private filters: string[] = [];
  private window: number[] | undefined;
  private orderBy: string | undefined;
  private single = false;
  private db: FakeDb;
  private table: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select(_columns?: string) {
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  insert(rows: Row[]) {
    this.op = "insert";
    this.rows = rows;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push(`${column}=eq.${value}`);
    this.predicates.push((row) => columnValue(row, column) === String(value));
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.filters.push(`${column}=in.(${values.join(",")})`);
    const set = new Set(values.map(String));
    this.predicates.push((row) => set.has(String(columnValue(row, column))));
    return this;
  }

  gte(column: string, value: string) {
    this.filters.push(`${column}=gte.${value}`);
    this.predicates.push(condition(`${column}.gte.${value}`));
    return this;
  }

  lte(column: string, value: string) {
    this.filters.push(`${column}=lte.${value}`);
    this.predicates.push(condition(`${column}.lte.${value}`));
    return this;
  }

  or(expr: string) {
    this.filters.push(`or=(${expr})`);
    this.predicates.push(parseLogic(expr, "or"));
    return this;
  }

  limit(count: number) {
    this.window = [0, count - 1];
    return this;
  }

  order(column: string) {
    this.orderBy = column;
    return this;
  }

  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  then<A = Result, B = never>(
    resolve?: ((value: Result) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(resolve, reject);
  }

  private run(): Result {
    const { db, table } = this;
    db.calls.push({
      table,
      op: this.op,
      filters: this.filters,
      range: this.window,
    });
    const failure = db.failures[`${table}:${this.op}`];
    if (failure) {
      delete db.failures[`${table}:${this.op}`];
      return { data: null, error: { message: failure } };
    }
    const all = (db.tables[table] ||= []);
    const match = (row: Row) => this.predicates.every((p) => p(row));
    if (this.op === "insert") {
      for (const row of this.rows) {
        all.push({ id: `row-${all.length + 1}-${Math.random()}`, ...row });
      }
      return { data: null, error: null };
    }
    if (this.op === "delete") {
      db.tables[table] = all.filter((row) => !match(row));
      return { data: null, error: null };
    }
    if (this.op === "update") {
      for (const row of all.filter(match)) {
        Object.assign(row, this.values);
      }
      return { data: null, error: null };
    }
    let rows = all.filter(match);
    if (this.orderBy) {
      const key = this.orderBy;
      rows = [...rows].sort((a, b) =>
        String(a[key]).localeCompare(String(b[key])),
      );
    }
    if (this.window) {
      // PostgREST caps every response at max_rows (1000 on Supabase).
      const [from, to] = this.window;
      rows = rows.slice(from, Math.min(to + 1, from + 1000));
    } else {
      rows = rows.slice(0, 1000);
    }
    if (this.single) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows.map((row) => structuredClone(row)), error: null };
  }
}

/** A column as PostgREST compares it: text, `data->>key` reads a JSON field, null when absent. */
function columnValue(row: Row, column: string): string | null {
  const arrow = column.indexOf("->>");
  let raw: unknown = row[column];
  if (arrow !== -1) {
    const parent = row[column.slice(0, arrow)];
    raw = isRecord(parent) ? parent[column.slice(arrow + 3)] : undefined;
  }
  return raw === undefined || raw === null ? null : String(raw);
}

/** Split a logic list on its top-level commas (not those inside nested parens). */
function splitTopLevel(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of expr) {
    if (char === "(") {
      depth++;
    }
    if (char === ")") {
      depth--;
    }
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

/** One `column.op.value` term as a row predicate. */
function condition(term: string): Predicate {
  const first = term.indexOf(".");
  const column = term.slice(0, first);
  const rest = term.slice(first + 1);
  const second = rest.indexOf(".");
  const op = rest.slice(0, second);
  const value = rest.slice(second + 1);
  return (row) => {
    const actual = columnValue(row, column);
    if (op === "is") {
      return value === "null" ? actual === null : false;
    }
    if (actual === null) {
      return false;
    }
    if (op === "eq") {
      return actual === value;
    }
    if (op === "gte") {
      return actual >= value;
    }
    if (op === "lte") {
      return actual <= value;
    }
    if (op === "lt") {
      return actual < value;
    }
    if (op === "in") {
      return value.slice(1, -1).split(",").includes(actual);
    }
    throw new Error(`fake-postgrest: unsupported op ${op}`);
  };
}
