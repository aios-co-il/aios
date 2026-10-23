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
      const { data, error } = await supabase
        .from("ai_conversations")
        .update({ title })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(NOT_CHANGED);
    },
    onSuccess: refresh,
    onError: fail("שינוי השם נכשל"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(NOT_CHANGED);
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

/**
 * RLS scopes ai_conversations writes to the user's own tenant: a chat from
 * another workspace matches no rows, which must not read as success.
 */
const NOT_CHANGED =
  "השיחה לא נמצאה בארגון הנוכחי. עברו לארגון של השיחה ונסו שוב.";
