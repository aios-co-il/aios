import type { DbClient } from "../../_shared/supabase-clients.ts";
import { applyChatScope, type ScopeFilterable } from "./filters.ts";
import { phoneTail, uuids } from "./ids.ts";
import { hasLeadAccess, leadInScope } from "./leads.ts";
import { queryRows } from "./query-rows.ts";
import type { ChatScope, ChatScopeRow, LeadOwner } from "./types.ts";

/** A chat_messages list query that applyChatScope can narrow. */
export interface ChatRowsQuery<T>
  extends
    PromiseLike<{ data: T[] | null; error: unknown }>,
    ScopeFilterable<ChatRowsQuery<T>> {}

/**
 * Runs a chat reader's chat_messages query inside the scope: pushes the scope
 * filters down, throws the query error, then keeps only the visible rows.
 */
export async function readScopedChatRows<T extends ChatScopeRow>(
  supabase: Pick<DbClient, "from">,
  query: ChatRowsQuery<T>,
  scope: ChatScope,
  tenantIds: string[],
): Promise<T[]> {
  const { data, error } = await applyChatScope(query, scope);
  if (error) {
    throw error;
  }

  return keepVisibleChatRows(supabase, data, scope, tenantIds);
}

/** Keeps only the rows the scope allows (loads lead owners when needed). */
export async function keepVisibleChatRows<T extends ChatScopeRow>(
  supabase: Pick<DbClient, "from">,
  data: T[] | null | undefined,
  scope: ChatScope,
  tenantIds: string[],
): Promise<T[]> {
  const list = Array.isArray(data) ? data : [];
  if (scope.mode === "full") {
    return list;
  }

  const owners =
    scope.mode === "staff" && !scope.leads.all && hasLeadAccess(scope.leads)
      ? await leadOwnersFor(supabase, list, tenantIds)
      : null;
  return list.filter((row) =>
    isChatRowVisible(
      { ...row, lead_id: row.lead_id?.toLowerCase() ?? null },
      scope,
      owners,
    ),
  );
}

/**
 * The row-level rule. Every row a chat tool returns passes through it, so a
 * query filter that is too wide can never leak a row.
 */
export function isChatRowVisible(
  row: ChatScopeRow,
  scope: ChatScope,
  leadOwners?: Map<string, LeadOwner> | null,
): boolean {
  if (scope.mode === "full") {
    return true;
  }

  if (scope.mode === "none") {
    return false;
  }

  if (row.provider === "green_api") {
    const conn = row.connection_user_id || "";
    if (!conn || !scope.connectionUserIds.includes(conn)) {
      return false;
    }
  }

  if (scope.mode === "group") {
    return !!scope.groupId && row.group_id === scope.groupId;
  }

  if (
    row.client_id &&
    (scope.clientIds === "all" || scope.clientIds.includes(row.client_id))
  ) {
    return true;
  }

  if (row.group_id && scope.linkedGroupIds.includes(row.group_id)) {
    return true;
  }

  if (
    row.lead_id &&
    leadInScope(leadOwners?.get(row.lead_id) ?? null, scope.leads)
  ) {
    return true;
  }

  return !!scope.ownThread && isOwnThreadRow(row, scope.ownThread);
}

/** The caller's own private chat with Carmen: Manus line, same sender phone. */
function isOwnThreadRow(
  row: ChatScopeRow,
  own: NonNullable<ChatScope["ownThread"]>,
): boolean {
  return (
    !row.group_id &&
    row.provider === "manus_wa" &&
    (!own.connectionUserId ||
      row.connection_user_id === own.connectionUserId) &&
    phoneTail(row.sender_phone) === own.phoneTail
  );
}

/** Agency and salesperson of the leads these rows belong to, by lead id. */
async function leadOwnersFor(
  supabase: Pick<DbClient, "from">,
  list: ChatScopeRow[],
  tenantIds: string[],
): Promise<Map<string, LeadOwner> | null> {
  const leadIds = uuids(list.map((r) => r.lead_id));
  if (!leadIds.length) {
    return null;
  }

  const found = await queryRows(
    supabase
      .from("leads")
      .select("id, agency_id, sales_person_id")
      .in("tenant_id", tenantIds)
      .in("id", leadIds),
  );
  return new Map(found.map((l) => [l.id.toLowerCase(), l]));
}
