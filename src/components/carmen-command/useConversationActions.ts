import { useCallback, type MutableRefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["cc-conversations", tenantId] });
  const fail = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });

  const rename = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("ai_conversations")
        .update({ title })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: fail("שינוי השם נכשל"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      if (id === conversationIdRef.current) startNewConversation();
      return refresh();
    },
    onError: fail("המחיקה נכשלה"),
  });

  const renameConversation = useCallback(
    (conv: TopicChat, title: string) =>
      rename.mutateAsync({ id: conv.id, title }).catch(() => undefined),
    [rename],
  );
  const deleteConversation = useCallback(
    (conv: TopicChat) => remove.mutateAsync(conv.id).catch(() => undefined),
    [remove],
  );

  return { renameConversation, deleteConversation };
}
