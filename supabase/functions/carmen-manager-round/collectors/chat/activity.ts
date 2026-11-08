/**
 * Reads of the client threads the chat collector reviews, through the
 * service-role SQL functions of 20261101101000_carmen_chat_sla.sql: only
 * client threads of the monitored lines leave the database (groups linked to
 * a client, direct chats with a phone on a client card). The tenant's Carmen
 * line adds its groups the Green lines do not read (carmen-line.ts).
 */
import { USER_SEND_KINDS } from "../../../_shared/client-card/send-kind.ts";
import type { Database } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { carmenGroupRows, carmenOnlyGroups } from "./carmen-line.ts";
import { MAX_PAGES, PAGE_ROWS } from "./paging.ts";

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
  /** The members' Green lines (connections.ts). */
  connectionIds: string[];
  /** The tenant's Carmen (Manus) lines, read for groups only. */
  carmenConnectionIds: Array<string>;
  since: Date;
  clientIds: string[] | null;
};

/** The rows read, and whether every thread was (false past the page cap). */
export type ActivityRead = { rows: ActivityRow[]; complete: boolean };

/** The provider the monitored lines store their rows under. */
export const MONITORED_PROVIDER = "green_api";

/** The provider Carmen's own line stores its rows under. */
export const CARMEN_PROVIDER = "manus_wa";

type Provider = typeof MONITORED_PROVIDER | typeof CARMEN_PROVIDER;

/** Messages per thread: enough to see the client's wait and the last reply. */
export const PER_THREAD = 15;

/**
 * Recent messages of every client-linked thread, oldest first per thread:
 * the Green lines' threads, then Carmen's groups that no Green line read.
 */
export async function loadThreadActivity(
  db: DbClient,
  query: ActivityQuery,
  collectorId: string,
): Promise<ActivityRead> {
  const read = (lines: Array<string>, provider: Provider) =>
    readThreads(db, query, { lines, provider, collectorId });
  const [green, carmen] = await Promise.all([
    read(query.connectionIds, MONITORED_PROVIDER),
    read(query.carmenConnectionIds, CARMEN_PROVIDER),
  ]);
  return {
    rows: [...green.rows, ...carmenGroupRows(carmen.rows, green.rows)],
    complete: green.complete && carmen.complete,
  };
}

/**
 * One provider's threads of `lines`. Pages are keyed by thread: a thread cut
 * by the row cap is read whole on the next page, so no thread loses a row
 * between pages. `collectorId` lets the function skip a shared group the
 * client's own tenant reads itself.
 */
async function readThreads(
  db: DbClient,
  query: ActivityQuery,
  read: { lines: Array<string>; provider: Provider; collectorId: string },
): Promise<ActivityRead> {
  if (!read.lines.length) {
    return { rows: [], complete: true };
  }
  const rows: Array<ActivityRow> = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .rpc("get_client_thread_activity", {
        p_tenant_id: query.tenantId,
        p_connection_user_ids: read.lines,
        p_since: query.since.toISOString(),
        p_collector: read.collectorId,
        // What a person sends from AIOS answers the client like a typed reply.
        p_person_send_kinds: [...USER_SEND_KINDS],
        p_provider: read.provider,
        p_client_ids: query.clientIds ?? undefined,
        p_per_thread: PER_THREAD,
        p_after_thread_key: after,
      })
      .limit(PAGE_ROWS);
    throwIf(error, "get_client_thread_activity");
    const got = data ?? [];
    if (got.length < PAGE_ROWS) {
      return { rows: [...rows, ...got], complete: true };
    }
    const cut = got[got.length - 1].thread_key;
    const whole = got.filter((row) => row.thread_key !== cut);
    after = whole.at(-1)?.thread_key;
    if (!after) {
      break;
    }
    rows.push(...whole);
  }
  return { rows, complete: false };
}

/** Unlinked groups with client traffic whose name matches one client, on any monitored line. */
export async function loadUnlinkedGroups(
  db: DbClient,
  query: Omit<ActivityQuery, "clientIds">,
): Promise<Array<UnlinkedGroupRow>> {
  const [green, carmen] = await Promise.all([
    readUnlinked(db, query, query.connectionIds, MONITORED_PROVIDER),
    readUnlinked(db, query, query.carmenConnectionIds, CARMEN_PROVIDER),
  ]);
  return [...green, ...carmenOnlyGroups(carmen, green)];
}

/** One provider's unlinked groups on `lines`. */
async function readUnlinked(
  db: DbClient,
  query: Omit<ActivityQuery, "clientIds">,
  lines: Array<string>,
  provider: Provider,
): Promise<Array<UnlinkedGroupRow>> {
  if (!lines.length) {
    return [];
  }
  const { data, error } = await db.rpc("get_unlinked_client_groups", {
    p_tenant_id: query.tenantId,
    p_connection_user_ids: lines,
    p_since: query.since.toISOString(),
    p_provider: provider,
  });
  throwIf(error, "get_unlinked_client_groups");
  return data ?? [];
}
