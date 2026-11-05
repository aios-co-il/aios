import { withChatScopeColumns } from "./filters.ts";
import { chatScopeMeta } from "./responses.ts";
import { readScopedChatRows } from "./rows.ts";
import { type ChatReadContext, scopedChatRead } from "./scoped-read.ts";
import type { ChatHistoryRow, InboundChatRow } from "./types.ts";

/** get_chat_history's tool arguments: untyped JSON from the model. */
export interface ChatHistoryArgs {
  contact_type?: unknown;
  contact_id?: unknown;
  limit?: number;
}

/** get_recent_inbound_messages' tool arguments. */
export interface RecentInboundArgs {
  hours?: number;
  limit?: number;
}

/**
 * get_chat_history: the latest messages of one client or lead, oldest first,
 * inside the caller's chat scope. A contact outside a staff scope is refused.
 */
export async function getChatHistory(
  ctx: ChatReadContext,
  args: ChatHistoryArgs,
): Promise<Record<string, unknown>> {
  const { scope, refusal } = await scopedChatRead(ctx, {
    type: args.contact_type,
    id: args.contact_id,
  });
  if (refusal) {
    return refusal;
  }

  const tenantIds = ctx.scopeInput.accessibleTenantIds;
  const filterCol = args.contact_type === "client" ? "client_id" : "lead_id";
  const visible = await readScopedChatRows(
    ctx.supabase,
    ctx.supabase
      .from("chat_messages")
      .select<string, ChatHistoryRow>(
        withChatScopeColumns(
          "id, message_text, direction, sender_name, created_at",
        ),
      )
      .in("tenant_id", tenantIds)
      // An untyped arg: supabase-js writes it into the URL as text either way.
      .eq(filterCol, String(args.contact_id))
      .order("created_at", { ascending: false })
      .limit(args.limit || 20),
    scope,
    tenantIds,
  );
  return {
    count: visible.length,
    messages: visible.reverse().map((m) => ({
      id: m.id,
      message_text: m.message_text,
      direction: m.direction,
      sender_name: m.sender_name,
      created_at: m.created_at,
    })),
    ...chatScopeMeta(scope),
  };
}

/**
 * get_recent_inbound_messages: inbound messages of the last `hours` inside
 * the caller's chat scope, newest first, each with a contact name.
 */
export async function getRecentInboundMessages(
  ctx: ChatReadContext,
  args: RecentInboundArgs,
): Promise<Record<string, unknown>> {
  const { scope, refusal } = await scopedChatRead(ctx, null);
  if (refusal) {
    return refusal;
  }

  const tenantIds = ctx.scopeInput.accessibleTenantIds;
  const hoursAgo = args.hours || 24;
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const data = await readScopedChatRows(
    ctx.supabase,
    ctx.supabase
      .from("chat_messages")
      .select<string, InboundChatRow>(
        withChatScopeColumns(
          "id, message_text, sender_name, sender_phone, created_at, client_id, lead_id, clients(name), leads(company_name)",
        ),
      )
      .in("tenant_id", tenantIds)
      .eq("direction", "inbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(args.limit || 30),
    scope,
    tenantIds,
  );
  return {
    count: data.length,
    // The scope columns are for the row check only; keep the old shape.
    messages: data.map(
      ({
        connection_user_id: _conn,
        provider: _provider,
        group_id: _group,
        ...m
      }) => ({
        ...m,
        contact_name:
          m.clients?.name ||
          m.leads?.company_name ||
          m.sender_name ||
          m.sender_phone,
      }),
    ),
    ...chatScopeMeta(scope),
  };
}
