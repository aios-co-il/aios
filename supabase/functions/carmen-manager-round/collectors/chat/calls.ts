/**
 * Completed phone calls to clients: a call after a client's message answers
 * it, whichever thread the message came in. A client of an agency shared
 * with the tenant may be called from its own tenant, so the tenants of the
 * clients read are searched too. A call stored as completed with zero
 * seconds (a missed call some PBXs report as completed) is no answer.
 * Calls are read by tenant and time and matched to the clients here, so the
 * request never lists every client id.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

export type CompletedCall = { client_id: string; created_at: string };

/** PostgREST returns at most this many rows per request. */
const PAGE_ROWS = 1_000;
const MAX_PAGES = 20;

/** Completed calls of these tenants to these clients since `since`. */
export async function loadCompletedCalls(
  db: DbClient,
  tenantIds: string[],
  clientIds: string[],
  since: Date,
): Promise<CompletedCall[]> {
  const wanted = new Set(clientIds);
  if (!wanted.size) {
    return [];
  }
  const calls: CompletedCall[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_ROWS;
    const { data, error } = await db
      .from("call_logs")
      .select("client_id, created_at")
      .in("tenant_id", tenantIds)
      .eq("status", "completed")
      .not("client_id", "is", null)
      .or("duration.is.null,duration.gt.0")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_ROWS - 1);
    throwIf(error, "call_logs");
    for (const row of data ?? []) {
      if (row.client_id && wanted.has(row.client_id)) {
        calls.push({ client_id: row.client_id, created_at: row.created_at });
      }
    }
    if ((data ?? []).length < PAGE_ROWS) {
      break;
    }
  }
  return calls;
}
