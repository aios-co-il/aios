import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const TENANT_ID = "aaaaaaaa-0000-4000-8000-000000000001";

const OTHER_TENANT_ID = "bbbbbbbb-0000-4000-8000-000000000002";

export const CLIENT_ID = "11111111-2222-3333-4444-555555555555";

export const FOREIGN_CLIENT_ID = "99999999-2222-3333-4444-555555555555";

const FOREIGN_META_URL = "https://business.facebook.com/adsmanager?act=666";

type Row = Record<string, unknown>;

/** A column value, reading `col->>key` from a JSON column the way PostgREST does. */
function valueOf(row: Row, column: string): unknown {
  const [col, key] = column.split("->>");
  if (!key) {
    return row[col];
  }
  const json = row[col];
  return json && typeof json === "object" ? (json as Row)[key] : undefined;
}

/** A query over in-memory rows that applies eq, in and `a.eq.x,b.eq.y` or filters. */
function fakeQuery(rows: Array<Row>) {
  let current = rows;
  const builder = {
    select: () => builder,
    order: () => builder,
    eq(column: string, value: unknown) {
      current = current.filter((row) => valueOf(row, column) === value);
      return builder;
    },
    in(column: string, values: Array<unknown>) {
      current = current.filter((row) => values.includes(valueOf(row, column)));
      return builder;
    },
    or(expression: string) {
      const terms = expression.split(",").map((term) => term.split(".eq."));
      current = current.filter((row) =>
        terms.some(([column, value]) => valueOf(row, column) === value),
      );
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve({ data: current[0] ?? null, error: null }),
    then<T>(resolve: (result: { data: Array<Row>; error: null }) => T) {
      return Promise.resolve({ data: current, error: null }).then(resolve);
    },
  };
  return builder;
}

/** A service-role client over two tenants' clients and tables. */
export function fakeSupabase(db: Record<string, Array<Row>>): SupabaseClient {
  const client = { from: (table: string) => fakeQuery(db[table] ?? []) };
  return client as unknown as SupabaseClient;
}

/** One client and its ads tables per tenant, plus this tenant's client with a table in the other tenant. */
export const TWO_TENANTS = {
  clients: [
    { id: CLIENT_ID, tenant_id: TENANT_ID, meta_ads_url: null },
    {
      id: FOREIGN_CLIENT_ID,
      tenant_id: OTHER_TENANT_ID,
      meta_ads_url: FOREIGN_META_URL,
    },
  ],
  crm_tables: [
    {
      tenant_id: TENANT_ID,
      client_id: CLIENT_ID,
      integration_type: "google_ads",
      integration_settings: { customer_id: "1234567890" },
    },
    {
      tenant_id: OTHER_TENANT_ID,
      client_id: CLIENT_ID,
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_777" },
    },
    {
      tenant_id: OTHER_TENANT_ID,
      client_id: FOREIGN_CLIENT_ID,
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_666" },
    },
  ],
};
