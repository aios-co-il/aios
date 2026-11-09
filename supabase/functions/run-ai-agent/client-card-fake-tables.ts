export type Row = Record<string, unknown>;

export type Tables = Record<string, Array<Row>>;

/**
 * A from() stand-in over in-memory tables: eq/in filter the table's rows,
 * maybeSingle returns the first match and awaiting the chain returns every
 * match. A table listed in `errors` fails instead.
 */
export function fakeTables(
  tables: Tables,
  errors: Record<string, { message: string }>,
) {
  const log: Array<{ table: string; op: string; args: Array<unknown> }> = [];
  /** Retains the original builder helper. */
  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    /** Retains the original matches helper. */
    function matches() {
      return (tables[table] ?? []).filter((row) =>
        filters.every((keep) => keep(row)),
      );
    }
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "order", "limit"]) {
      chain[op] = (...args: Array<unknown>) => {
        log.push({ table, op, args });
        return chain;
      };
    }
    chain.eq = (column: string, value: unknown) => {
      log.push({ table, op: "eq", args: [column, value] });
      filters.push((row) => row[column] === value);
      return chain;
    };
    chain.in = (column: string, values: Array<unknown>) => {
      log.push({ table, op: "in", args: [column, values] });
      filters.push((row) => values.includes(row[column]));
      return chain;
    };
    chain.maybeSingle = async () =>
      errors[table]
        ? { data: null, error: errors[table] }
        : { data: matches()[0] ?? null, error: null };
    chain.then = (
      resolve: (result: { data: Array<Row>; error: null }) => void,
    ) => resolve({ data: matches(), error: null });
    return chain;
  }
  return { supabase: { from: builder }, log };
}
