import type { ChatReadContext } from "../chat-scope/scoped-read.ts";
import type { SearchConversationHistoryArgs } from "./conversation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { scopedChatRead } from "../chat-scope/scoped-read.ts";
import { isGroupChat } from "../finding-draft/reply.ts";
import { withChatScopeColumns } from "../chat-scope/filters.ts";
import type { ChatHistorySearchRow } from "../tool-contracts-marketing.ts";
import { readScopedChatRows, type ChatRowsQuery } from "../chat-scope/rows.ts";
import { chatScopeMeta } from "../chat-scope/responses.ts";

/** Preserves the existing search_conversation_history executor and side-effect order. */
export async function executeSearchConversationHistory(
  args: SearchConversationHistoryArgs,
  context: ToolExecutionContext,
  chatRead: ChatReadContext,
) {
  const { supabase, tenantId, accessibleTenantIds, waNotify } = context;

  const { scope: chatScope, refusal } = await scopedChatRead(chatRead, null);
  if (refusal) {
    return refusal;
  }

  const rawQuery = String(args.query || "").trim();
  // AND semantics: every token must appear in the message. Up to 4 tokens.
  // No query = browse mode: chronological slice of the window, which then
  // MUST be narrowed (Carmen channel / specific phone) or the whole tenant's
  // WhatsApp traffic floods the result.
  const tokens = rawQuery.split(/\s+/).filter(Boolean).slice(0, 4);
  const browseMode = tokens.length === 0;
  const daysBack = Math.min(
    Number(args.days_back) > 0 ? Number(args.days_back) : 180,
    730,
  );
  const since = new Date(
    Date.now() - daysBack * 24 * 60 * 60 * 1000,
  ).toISOString();
  const defaultLimit = browseMode ? 40 : 20;
  let withPhone = String(args.with_phone || "").replace(/\D/g, "");
  const onlyCarmen =
    args.only_carmen_chats === true ||
    (browseMode && args.only_carmen_chats !== false);
  const browseAll = args.browse_all_chats === true;
  // Default: stay inside the active WhatsApp chat_id (private or group).
  let scopeGroupId: string | null = null;
  let scopeNote = "current_chat";
  if (!browseAll && waNotify?.chat_id) {
    const chatId = String(waNotify.chat_id);
    if (isGroupChat(waNotify)) {
      const { data: g } = await supabase
        .from("whatsapp_groups")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("group_chat_id", chatId)
        .maybeSingle();
      scopeGroupId = g?.id || null;
      if (!scopeGroupId) {
        return {
          count: 0,
          mode: browseMode ? "browse" : "keyword_search",
          note: "הקבוצה הנוכחית לא נמצאה — נסי browse_all_chats=true אם צריך חיפוש ארגוני.",
        };
      }
    } else if (!withPhone) {
      withPhone = chatId.split("@")[0].replace(/\D/g, "");
    }
  } else if (browseAll) {
    scopeNote = "all_chats";
  }
  let q = supabase
    .from("chat_messages")
    .select(
      withChatScopeColumns(
        "message_text, direction, sender_name, sender_phone, created_at, group_id, provider, clients(name)",
      ),
    )
    .in("tenant_id", accessibleTenantIds)
    .gte("created_at", since)
    .not("message_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(
      Math.min(Number(args.limit) > 0 ? Number(args.limit) : defaultLimit, 60),
    );
  for (const t of tokens) {
    q = q.ilike("message_text", `%${t}%`);
  }
  if (onlyCarmen) {
    q = q.eq("provider", "manus_wa");
  }
  if (scopeGroupId) {
    q = q.eq("group_id", scopeGroupId);
  } else if (withPhone && !browseAll) {
    q = q
      .is("group_id", null)
      .ilike("sender_phone", `%${withPhone.slice(-9)}%`);
  } else if (withPhone) {
    q = q.ilike("sender_phone", `%${withPhone}%`);
  }
  const data: Array<ChatHistorySearchRow> = await readScopedChatRows(
    supabase,
    q as unknown as ChatRowsQuery<ChatHistorySearchRow>,
    chatScope,
    accessibleTenantIds,
  );
  /** Retains the original fmt helper. */
  function fmt(iso: string | null) {
    return new Date(iso === null ? 0 : iso).toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return {
    count: data.length,
    mode: browseMode ? "browse" : "keyword_search",
    scope: scopeNote,
    chat_id: waNotify?.chat_id || null,
    note:
      data.length === 0
        ? browseMode
          ? "אין הודעות בחלון הזמן בצ׳אט הנוכחי — נסי days_back גדול יותר או browse_all_chats=true."
          : "אין תוצאות בצ׳אט הנוכחי — נסי מילת תוכן אחרת או browse_all_chats=true."
        : undefined,
    messages: data.reverse().map((m) => ({
      when_israel: fmt(m.created_at),
      direction: m.direction,
      from: m.sender_name || m.sender_phone || "",
      client: m.clients?.name || null,
      in_group: !!m.group_id,
      text: String(m.message_text).slice(0, 400),
    })),
    ...chatScopeMeta(chatScope),
  };
}
