import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readResumeChat } from "@/lib/carmenResumeChat";

/**
 * True when Carmen answered in the session panel's chat after the panel was
 * closed, so the header button can show it. Clears when the panel opens.
 */
export function useCarmenUnreadReply(open: boolean): boolean {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (open) {
      setUnread(false);
      return;
    }
    const chat = readResumeChat();
    const closedAt = chat?.closedAt;
    if (!chat || !closedAt) return;
    let alive = true;
    // Run once the subscription is live, so an answer landing in between
    // is caught by one or the other.
    const catchUp = () =>
      supabase
        .from("ai_conversation_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", chat.conversationId)
        .eq("role", "assistant")
        .gt("created_at", closedAt)
        .then(({ count }) => {
          if (alive && count) setUnread(true);
        });
    const channel = supabase
      .channel(`carmen-unread-${chat.conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_conversation_messages",
          filter: `conversation_id=eq.${chat.conversationId}`,
        },
        (payload: { new: { role?: string } }) => {
          if (payload.new?.role === "assistant") setUnread(true);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") catchUp();
      });
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [open]);

  return unread;
}
