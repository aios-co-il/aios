// In-memory stand-in for the Supabase client, for the Deno tests of the
// system-send recorders (system-send.ts and trigger-automation's
// client-recipient.ts).

type Row = Record<string, unknown>;

/** A PostgREST stand-in: filters rows by eq/in and records inserts and RPCs. */
export function fakeSystemSendDb(seed: {
  clients?: Row[];
  whatsapp_groups?: Row[];
  loggingOn?: unknown;
  flagError?: unknown;
  groupClient?: Record<string, string | null>;
  insertError?: unknown;
  throwOn?: string;
}) {
  const inserts: Array<{ table: string; row: Row }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const queries: string[] = [];
  const tables: Record<string, Row[]> = {
    clients: seed.clients ?? [],
    whatsapp_groups: seed.whatsapp_groups ?? [],
  };
  function builder(table: string) {
    if (seed.throwOn === table) {
      throw new Error(`boom ${table}`);
    }
    queries.push(table);
    let rows = [...(tables[table] ?? [])];
    const result = () => Promise.resolve({ data: rows, error: null });
    const b = {
      select: () => b,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return b;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return b;
      },
      limit: () => b,
      maybeSingle: () =>
        Promise.resolve({ data: rows[0] ?? null, error: null }),
      insert: (row: Row) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: seed.insertError ?? null });
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => result().then(resolve, reject),
    };
    return b;
  }
  return {
    inserts,
    rpcs,
    queries,
    from: builder,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn === "client_card_logs_system_sends") {
        return Promise.resolve({
          data: "loggingOn" in seed ? seed.loggingOn : true,
          error: seed.flagError ?? null,
        });
      }
      if (fn === "resolve_whatsapp_group_client") {
        return Promise.resolve({
          data: seed.groupClient?.[String(args.p_group)] ?? null,
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: "unknown" } });
    },
  };
}
