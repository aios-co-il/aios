// In-memory chat_messages for the Deno tests of stored-send-forward.ts.

type Row = Record<string, unknown>;

/**
 * chat_messages as PostgREST sees it: eq filters on columns and on
 * raw_provider_data->>key paths, and a conditional update that returns the
 * rows it changed. Each call resolves on a later microtask, so concurrent
 * claims interleave like two webhook deliveries.
 */
export function fakeChatMessages(
  seed: Row[],
  opts: { selectError?: unknown; updateError?: unknown } = {},
) {
  const rows = seed.map((row) => structuredClone(row));
  const updates: Row[] = [];
  const value = (row: Row, column: string) => {
    const path = column.match(/^raw_provider_data->>(.+)$/);
    if (!path) {
      return row[column];
    }
    const raw = row.raw_provider_data;
    const v =
      raw && typeof raw === "object" ? Reflect.get(raw, path[1]) : undefined;
    return v === undefined || v === null ? null : String(v);
  };
  const later = <T>(fn: () => T) =>
    new Promise<T>((resolve) => queueMicrotask(() => resolve(fn())));
  return {
    rows,
    updates,
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table: string) {
      if (table !== "chat_messages") {
        throw new Error(`unexpected table ${table}`);
      }
      const filters: Array<[string, unknown]> = [];
      const matching = () =>
        rows.filter((row) => filters.every(([c, v]) => value(row, c) === v));
      let patch: Row | null = null;
      const b = {
        select: () => b,
        update: (next: Row) => {
          patch = next;
          return b;
        },
        eq: (column: string, v: unknown) => {
          filters.push([column, v]);
          return b;
        },
        limit: () => b,
        maybeSingle: () =>
          later(() =>
            opts.selectError
              ? { data: null, error: opts.selectError }
              : { data: structuredClone(matching()[0] ?? null), error: null },
          ),
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          later(() => {
            if (!patch) {
              return { data: matching(), error: null };
            }
            if (opts.updateError) {
              return { data: null, error: opts.updateError };
            }
            const hit = matching();
            for (const row of hit) {
              Object.assign(row, patch);
            }
            updates.push(patch);
            return { data: hit.map((row) => ({ id: row.id })), error: null };
          }).then(resolve, reject),
      };
      return b;
    },
  };
}
