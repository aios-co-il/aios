// In-memory processed_webhook_messages and tenant_integrations for the Deno
// tests of message-claim.ts and automation-dispatch.ts.

type Row = Record<string, unknown>;

/** processed_webhook_messages_provider_tenant_message_key (20261021090000). */
const CLAIM_KEY = ["provider", "tenant_id", "external_message_id"];

/**
 * The two tables as PostgREST sees them: insert (23505 on the claim key),
 * select, update and delete filtered by eq, match, is and in, and select after
 * a write returning the rows it changed. Each call resolves on a later
 * microtask, so concurrent deliveries interleave like real ones. `failInsert`
 * makes every insert fail with that error; `failSelect` every read.
 */
export function fakeClaimTables(
  seed: { claims?: Row[]; integrations?: Row[] } = {},
  opts: { failInsert?: unknown; failSelect?: unknown } = {},
) {
  const tables: Record<string, Row[]> = {
    processed_webhook_messages: (seed.claims ?? []).map((row) => ({
      processed_at: new Date().toISOString(),
      completed_at: null,
      ...row,
    })),
    tenant_integrations: (seed.integrations ?? []).map((row) =>
      structuredClone(row),
    ),
  };
  const later = <T>(fn: () => T) =>
    new Promise<T>((resolve) => queueMicrotask(() => resolve(fn())));
  return {
    claims: tables.processed_webhook_messages,
    integrations: tables.tenant_integrations,
    from(table: string) {
      const rows = tables[table];
      if (!rows) {
        throw new Error(`unexpected table ${table}`);
      }
      const filters: Array<(row: Row) => boolean> = [];
      let write: { kind: "insert" | "update" | "delete"; row?: Row } | null =
        null;
      const matching = () => rows.filter((row) => filters.every((f) => f(row)));
      const run = () => {
        if (write?.kind === "insert" && write.row) {
          if (opts.failInsert) {
            return { data: null, error: opts.failInsert };
          }
          const next: Row = {
            processed_at: new Date().toISOString(),
            completed_at: null,
            ...write.row,
          };
          const taken = rows.some((row) =>
            CLAIM_KEY.every((column) => row[column] === next[column]),
          );
          if (taken) {
            return { data: null, error: { code: "23505", message: "dup" } };
          }
          rows.push(next);
          return { data: [next], error: null };
        }
        if (opts.failSelect && !write) {
          return { data: null, error: opts.failSelect };
        }
        const hit = matching();
        if (write?.kind === "update") {
          hit.forEach((row) => Object.assign(row, write?.row));
        }
        if (write?.kind === "delete") {
          hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
        }
        return { data: hit.map((row) => structuredClone(row)), error: null };
      };
      const b = {
        insert: (row: Row) => {
          write = { kind: "insert", row };
          return b;
        },
        update: (row: Row) => {
          write = { kind: "update", row };
          return b;
        },
        delete: () => {
          write = { kind: "delete" };
          return b;
        },
        select: () => b,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return b;
        },
        match: (values: Row) => {
          for (const [column, value] of Object.entries(values)) {
            filters.push((row) => row[column] === value);
          }
          return b;
        },
        is: (column: string, value: null) => {
          filters.push((row) => (row[column] ?? null) === value);
          return b;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return b;
        },
        maybeSingle: () =>
          later(() => {
            const { data, error } = run();
            return { data: data?.[0] ?? null, error };
          }),
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => later(run).then(resolve, reject),
      };
      return b;
    },
  };
}
