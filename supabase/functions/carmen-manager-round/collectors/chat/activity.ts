/**
 * Reads of the client threads the chat collector reviews, through the
 * service-role SQL functions of 20261027101000_carmen_chat_sla.sql: only
 * client-linked threads of the monitored lines leave the database.
 */
import type { Database } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

type Functions = Database["public"]["Functions"];

type GeneratedActivityRow =
  Functions["get_client_thread_activity"]["Returns"][number];

/** A message of a client thread; the generator types these SQL NULLs as non-null. */
export type ActivityRow = Omit<
  GeneratedActivityRow,
  "client_tenant_id" | "group_id" | "sender_match_key" | "sent_by_user_id"
> & {
  client_tenant_id: string | null;
  group_id: string | null;
  sender_match_key: string | null;
  sent_by_user_id: string | null;
};

export type UnlinkedGroupRow =
  Functions["get_unlinked_client_groups"]["Returns"][number];

export type ActivityQuery = {
  tenantId: string;
  connectionIds: string[];
  since: Date;
  clientIds: string[] | null;
};

/** The provider the monitored lines store their rows under. */
export const MONITORED_PROVIDER = "green_api";

/** Messages per thread: enough to see the client's wait and the last reply. */
export const PER_THREAD = 15;

/** PostgREST returns at most this many rows per request. */
const PAGE_ROWS = 1_000;
const MAX_PAGES = 20;

/** Recent messages of every client-linked thread, oldest first per thread. */
export async function loadThreadActivity(
  db: DbClient,
  query: ActivityQuery,
): Promise<ActivityRow[]> {
  const rows: ActivityRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_ROWS;
    const { data, error } = await db
      .rpc("get_client_thread_activity", {
        p_tenant_id: query.tenantId,
        p_connection_user_ids: query.connectionIds,
        p_since: query.since.toISOString(),
        p_provider: MONITORED_PROVIDER,
        p_client_ids: query.clientIds ?? undefined,
        p_per_thread: PER_THREAD,
      })
      .range(from, from + PAGE_ROWS - 1);
    throwIf(error, "get_client_thread_activity");
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_ROWS) {
      return rows;
    }
  }
  throw new Error("get_client_thread_activity: more rows than expected");
}

/** Unlinked groups with client traffic whose name matches one client. */
export async function loadUnlinkedGroups(
  db: DbClient,
  query: Omit<ActivityQuery, "clientIds">,
): Promise<UnlinkedGroupRow[]> {
  const { data, error } = await db.rpc("get_unlinked_client_groups", {
    p_tenant_id: query.tenantId,
    p_connection_user_ids: query.connectionIds,
    p_since: query.since.toISOString(),
    p_provider: MONITORED_PROVIDER,
  });
  throwIf(error, "get_unlinked_client_groups");
  return data ?? [];
}
