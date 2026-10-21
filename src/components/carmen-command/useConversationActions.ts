import { useCallback, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { TopicChat } from "@/lib/chatTopics";

/** Rename and delete for the chat history rail (the ⋮ menu). */
export function useConversationActions(
  tenantId: string | null | undefined,
  conversationIdRef: MutableRefObject<string | null>,
  startNewConversation: () => void,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const run = useCallback(
    async (failTitle: string, op: () => PromiseLike<{ error: any }>) => {
      const { error } = await op();
      if (error) {
        toast({
          title: failTitle,
          description: error.message,
          variant: "destructive",
        });
        return false;
      }
      queryClient.invalidateQueries({
        queryKey: ["cc-conversations", tenantId],
      });
      return true;
    },
    [queryClient, tenantId, toast],
  );

  const renameConversation = useCallback(
    async (conv: TopicChat, title: string) => {
      await run("שינוי השם נכשל", () =>
        (supabase as any)
          .from("ai_conversations")
          .update({ title })
          .eq("id", conv.id),
      );
    },
    [run],
  );

  const deleteConversation = useCallback(
    async (conv: TopicChat) => {
      const ok = await run("המחיקה נכשלה", () =>
        (supabase as any).from("ai_conversations").delete().eq("id", conv.id),
      );
      if (ok && conv.id === conversationIdRef.current) startNewConversation();
    },
    [run, conversationIdRef, startNewConversation],
  );

  return { renameConversation, deleteConversation };
}
