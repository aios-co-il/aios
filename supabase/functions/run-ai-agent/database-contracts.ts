import type { Database } from "../_shared/database.types.ts";
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export type AgentDatabaseClient = ReturnType<typeof createClient<Database>>;

export type AgentRow<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];

/** Mirrors a NOT NULL column: fails before the request instead of letting PostgREST reject it. */
export function requireInsertValue<Value>(
  value: Value | null | undefined,
  column: string,
): Value {
  if (value === null || value === undefined) {
    throw new Error(`${column} is required`);
  }
  return value;
}

/** Insert payload that also carries a tenant_id the table does not have; PostgREST rejects it (PGRST204). */
export type WithUndeclaredTenantId<Row> = Row & { tenant_id: string };
