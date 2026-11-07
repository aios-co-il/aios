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

/** The parent lookup needed before writing a lead or task update. */
export interface UpdateEntityLookup {
  from(table: "leads" | "tasks"): {
    select(columns: "id"): {
      eq(
        column: "id",
        id: string,
      ): {
        in(
          column: "tenant_id",
          tenantIds: string[],
        ): {
          maybeSingle(): PromiseLike<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

/** Update tables inherit tenant scope from their parent record. */
export async function requireUpdateEntityScope(
  db: UpdateEntityLookup,
  table: "leads" | "tasks",
  id: string,
  tenantIds: string[],
): Promise<void> {
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .in("tenant_id", tenantIds)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Update entity is outside the accessible tenants");
  }
}
