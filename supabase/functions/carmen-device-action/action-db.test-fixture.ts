import type { ActionDb } from "./rows.ts";

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, Array<FakeRow>>;

/** What a query on the fake resolves to. */
type FakeResult = {
  data: Array<FakeRow> | null;
  error: { message: string } | null;
};

/**
 * A stand-in for the Supabase client over in-memory rows: a query matches the rows that
 * pass every filter (`.eq()`, `.neq()`, `.gt()`, `.lte()`, `.is()`, `.in()`) and `visible`,
 * which plays row-level security; `.update()` changes exactly those rows, `.insert()` adds one
 * row with a fresh id, and `.upsert()` with `ignoreDuplicates` adds one unless a row already
 * holds the same values in its `onConflict` columns. `.or()` and `.limit()` keep every row:
 * a test holds only the rows such a filter would match. A query resolves through `.maybeSingle()`, `.single()` or by being
 * awaited for every row. `failing` names a table whose queries return an error, or picks
 * the failing queries by their table and `.eq()` filters.
 */
export function fakeDb(
  tables: FakeTables,
  visible: (row: FakeRow) => boolean = () => true,
  failing?: string | ((table: string, equals: FakeRow) => boolean),
): ActionDb {
  /** One query on a table. */
  function from(table: string) {
    const filters = [visible];
    let patch: FakeRow | null = null;
    let inserted: FakeRow | null = null;
    let orderedBy: string | null = null;
    let conflictColumns: Array<string> = [];
    const equals: FakeRow = {};

    /** Runs the query: its write, then the rows it matches. */
    function run(): FakeResult {
      const fails =
        typeof failing === "function"
          ? failing(table, equals)
          : table === failing;
      if (fails) {
        return { data: null, error: { message: "boom" } };
      }
      if (inserted) {
        const row = inserted;
        const existing = (tables[table] ?? []).find(
          (stored) =>
            conflictColumns.length > 0 &&
            conflictColumns.every((column) => stored[column] === row[column]),
        );
        if (existing) {
          return { data: [], error: null };
        }
        (tables[table] ??= []).push(row);
        return { data: [row], error: null };
      }
      const rows = (tables[table] ?? []).filter((row) =>
        filters.every((passes) => passes(row)),
      );
      rows.forEach((row) => Object.assign(row, patch));
      if (orderedBy) {
        const column = orderedBy;
        rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])));
      }
      return { data: rows, error: null };
    }

    const query = {
      select: () => query,
      insert(values: FakeRow) {
        inserted = { id: crypto.randomUUID(), ...values };
        return query;
      },
      upsert(
        values: FakeRow,
        options: { onConflict: string; ignoreDuplicates: true },
      ) {
        inserted = { id: crypto.randomUUID(), ...values };
        conflictColumns = options.onConflict.split(",");
        return query;
      },
      update(values: FakeRow) {
        patch = values;
        return query;
      },
      eq(column: string, value: unknown) {
        equals[column] = value;
        filters.push((row) => row[column] === value);
        return query;
      },
      or() {
        return query;
      },
      limit() {
        return query;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return query;
      },
      gt(column: string, value: string) {
        filters.push((row) => String(row[column]) > value);
        return query;
      },
      lte(column: string, value: string) {
        filters.push((row) => String(row[column]) <= value);
        return query;
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value);
        return query;
      },
      in(column: string, values: Array<unknown>) {
        filters.push((row) => values.includes(row[column]));
        return query;
      },
      order(column: string) {
        orderedBy = column;
        return query;
      },
      maybeSingle() {
        const { data, error } = run();
        return Promise.resolve({ data: data?.[0] ?? null, error });
      },
      single() {
        const { data, error } = run();
        return Promise.resolve(
          error || data?.[0]
            ? { data: data?.[0] ?? null, error }
            : { data: null, error: { message: "no row" } },
        );
      },
      then<Result>(resolve: (result: FakeResult) => Result) {
        return Promise.resolve(run()).then(resolve);
      },
    };
    return query;
  }

  // The fake implements only the calls its users make (rows.ts, run-stop.ts and
  // run-ai-agent/device-turn), so it is not the full client type.
  return { from } as unknown as ActionDb;
}
