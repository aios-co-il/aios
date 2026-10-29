/**
 * An in-memory crm_tables behind the supabase client module, for tests of the
 * dashboard's target save: only the calls savePulseTargetToTables and
 * useSavePulseTarget make. Tests swap it in with
 * `vi.mock("@/integrations/supabase/client", () => import("./pulseTargetSaveFake"))`.
 */

/** One crm_tables row; RLS lets the user read a readOnly row but not update it. */
export type FakeCrmTable = {
  tenant_id: string;
  settings: unknown;
  name?: string;
  readOnly?: boolean;
};

type Result = { data: unknown; error: null };

/**
 * The rows by id, every read and write in order, and a hook that runs after each
 * write a row took (a sync or a role change landing between two steps).
 */
export const crmTables: {
  rows: Record<string, FakeCrmTable>;
  log: string[];
  afterWrite?: (id: string) => void;
} = { rows: {}, log: [] };

/** The signed-in user's lookup: set `error` to make it fail. */
export const auth: { error: Error | null } = { error: null };

/** The signed-in user, and crm_tables. */
export const supabase = {
  auth: {
    getUser: async () =>
      auth.error
        ? { data: { user: null }, error: auth.error }
        : { data: { user: { id: "user-1" } }, error: null },
  },
  from: () => ({
    select: () => readQuery(),
    update: (patch: { integration_settings: unknown }) => updateQuery(patch),
  }),
};

/** The eq filters of one query and the row they select (none across tenants). */
function filters() {
  const values: Record<string, unknown> = {};
  const row = () => {
    const found = crmTables.rows[String(values.id)];
    return found && found.tenant_id === values.tenant_id ? found : null;
  };
  return { values, row };
}

/** select(...).eq(...).eq(...).maybeSingle() */
function readQuery() {
  const query = filters();
  const chain = {
    eq: (column: string, value: unknown) => {
      query.values[column] = value;
      return chain;
    },
    maybeSingle: async (): Promise<Result> => {
      crmTables.log.push(`read ${query.values.id}`);
      const found = query.row();
      return {
        data: found
          ? {
              name: found.name ?? String(query.values.id),
              integration_settings: found.settings,
            }
          : null,
        error: null,
      };
    },
  };
  return chain;
}

/** update(...).eq(...).eq(...), awaited as is or with .select(). */
function updateQuery(patch: { integration_settings: unknown }) {
  const query = filters();
  /** Writes where RLS allows it: a readOnly row matches nothing, with no error. */
  const apply = () => {
    const id = String(query.values.id);
    crmTables.log.push(`write ${id}`);
    const found = query.row();
    if (!found || found.readOnly) {
      return [];
    }
    found.settings = patch.integration_settings;
    crmTables.afterWrite?.(id);
    return [{ id }];
  };
  const chain = {
    eq: (column: string, value: unknown) => {
      query.values[column] = value;
      return chain;
    },
    // supabase-js returns the updated rows only when .select() asks for them.
    select: async (): Promise<Result> => ({ data: apply(), error: null }),
    then: (resolve: (result: Result) => unknown) => {
      apply();
      return resolve({ data: null, error: null });
    },
  };
  return chain;
}
