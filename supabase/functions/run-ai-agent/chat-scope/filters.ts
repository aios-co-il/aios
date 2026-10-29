import { hasLeadAccess } from "./leads.ts";
import type { ChatScope, ChatScopeFilter } from "./types.ts";

/** Columns the scope check needs on every chat_messages row it filters. */
export const CHAT_SCOPE_COLUMNS = [
  "client_id",
  "lead_id",
  "group_id",
  "provider",
  "connection_user_id",
  "sender_phone",
];

/** Above this many ids, push a coarse filter down and rely on the row check. */
const MAX_PUSHDOWN_IDS = 150;

/** The query builder calls applyChatScope chains. */
export interface ScopeFilterable<Q> {
  or(filters: string): Q;
  is(column: string, value: null): Q;
  eq(column: string, value: string): Q;
  neq(column: string, value: string): Q;
}

/**
 * PostgREST filters that narrow a chat_messages query to the scope. They may
 * return a few rows too many (coarse lead and long-list filters); the row
 * check removes those.
 */
export function chatScopeFilters(scope: ChatScope): ChatScopeFilter[] {
  if (scope.mode === "full") {
    return [];
  }

  if (scope.mode === "group") {
    return groupFilters(scope);
  }

  const parts = scope.mode === "staff" ? staffParts(scope) : [];
  if (!parts.length) {
    return matchNothing();
  }

  return [
    { op: "or", value: `and(or(${parts.join(",")}),${greenRule(scope)})` },
  ];
}

/** Applies chatScopeFilters to a supabase-js chat_messages query. */
export function applyChatScope<Q extends ScopeFilterable<Q>>(
  query: Q,
  scope: ChatScope,
): Q {
  let out = query;
  for (const f of chatScopeFilters(scope)) {
    if (f.op === "or") {
      out = out.or(f.value);
    } else if (f.op === "is") {
      out = out.is(f.column, f.value);
    } else {
      out = out[f.op](f.column, f.value);
    }
  }

  return out;
}

/** Adds the columns the row check needs to a select list, without duplicates. */
export function withChatScopeColumns(select: string): string {
  const present = new Set<string>();
  let depth = 0;
  let current = "";
  for (const ch of select + ",") {
    if (ch === "(") {
      depth += 1;
    }

    if (ch === ")") {
      depth -= 1;
    }

    if (ch === "," && depth === 0) {
      const name = current.trim();
      if (name && !name.includes("(")) {
        present.add(name);
      }

      current = "";
    } else {
      current += ch;
    }
  }

  const missing = CHAT_SCOPE_COLUMNS.filter((c) => !present.has(c));
  return missing.length ? `${select}, ${missing.join(", ")}` : select;
}

/** A group turn: that group only, and green_api rows only on allowed lines. */
function groupFilters(scope: ChatScope): ChatScopeFilter[] {
  if (!scope.groupId) {
    return matchNothing();
  }

  return [
    { op: "eq", column: "group_id", value: scope.groupId },
    scope.connectionUserIds.length
      ? {
          op: "or",
          value: `provider.neq.green_api,connection_user_id.in.${idList(scope.connectionUserIds)}`,
        }
      : { op: "neq", column: "provider", value: "green_api" },
  ];
}

/** The or() alternatives of a staff scope; empty when nothing can match. */
function staffParts(scope: ChatScope): string[] {
  const parts: string[] = [];
  if (scope.clientIds === "all" || scope.clientIds.length > MAX_PUSHDOWN_IDS) {
    parts.push("client_id.not.is.null");
  } else if (scope.clientIds.length) {
    parts.push(`client_id.in.${idList(scope.clientIds)}`);
  }

  if (scope.linkedGroupIds.length > MAX_PUSHDOWN_IDS) {
    parts.push("group_id.not.is.null");
  } else if (scope.linkedGroupIds.length) {
    parts.push(`group_id.in.${idList(scope.linkedGroupIds)}`);
  }

  if (hasLeadAccess(scope.leads)) {
    parts.push("lead_id.not.is.null");
  }

  if (scope.ownThread) {
    const conn = scope.ownThread.connectionUserId
      ? `,connection_user_id.eq.${scope.ownThread.connectionUserId}`
      : "";
    parts.push(
      `and(group_id.is.null,provider.eq.manus_wa,sender_phone.ilike.*${scope.ownThread.phoneTail}*${conn})`,
    );
  }

  return parts;
}

/** A filter no row passes (id is never null). */
function matchNothing(): ChatScopeFilter[] {
  return [{ op: "is", column: "id", value: null }];
}

/** green_api rows only on the scope's allowed connections. */
function greenRule(scope: ChatScope): string {
  return scope.connectionUserIds.length
    ? `or(provider.neq.green_api,connection_user_id.in.${idList(scope.connectionUserIds)})`
    : "provider.neq.green_api";
}

/** A PostgREST in-list: (a,b,c). */
function idList(ids: string[]): string {
  return `(${ids.join(",")})`;
}
