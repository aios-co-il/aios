// PostgREST's row filtering for the guard's in-memory database
// (fake-guard-db.ts): the operators the guard's reads use.

type Row = Record<string, unknown>;

/**
 * The rows that pass every `eq.`, `gte.` and `is.null` filter, ordered and
 * limited. `gte` compares as strings, which orders ISO timestamps.
 */
export function selectRows(
  rows: Array<Row>,
  params: URLSearchParams,
): Array<Row> {
  const filters = [...params].filter(([column]) => column !== "select");
  let selected = rows.filter((row) =>
    filters.every(([column, value]) => passes(row[column], value)),
  );
  const order = params.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    const sign = direction === "desc" ? -1 : 1;
    selected = [...selected].sort(
      (a, b) => String(a[column]).localeCompare(String(b[column])) * sign,
    );
  }
  const limit = params.get("limit");
  return limit ? selected.slice(0, Number(limit)) : selected;
}

/** Whether a cell passes one PostgREST filter; other operators pass all rows. */
function passes(cell: unknown, filter: string): boolean {
  if (filter.startsWith("eq.")) {
    return String(cell) === filter.slice(3);
  }
  if (filter.startsWith("gte.")) {
    return String(cell) >= filter.slice(4);
  }
  if (filter === "is.null") {
    return cell === null || cell === undefined;
  }
  return true;
}
