/**
 * Completed phone calls to clients: a call after a client's message answers
 * it, whichever thread the message came in. A client of an agency shared
 * with the tenant may be called from its own tenant, so the tenants of the
 * clients read are searched too.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

export type CompletedCall = { client_id: string; created_at: string };

/** Completed calls of these tenants to these clients since `since`. */
export async function loadCompletedCalls(
  db: DbClient,
  tenantIds: string[],
  clientIds: string[],
  since: Date,
): Promise<CompletedCall[]> {
  if (!clientIds.length) {
    return [];
  }
  const { data, error } = await db
    .from("call_logs")
    .select("client_id, created_at")
    .in("tenant_id", tenantIds)
    .eq("status", "completed")
    .in("client_id", clientIds)
    .gte("created_at", since.toISOString());
  throwIf(error, "call_logs");
  return (data ?? []).flatMap((row) =>
    row.client_id
      ? [{ client_id: row.client_id, created_at: row.created_at }]
      : [],
  );
}
