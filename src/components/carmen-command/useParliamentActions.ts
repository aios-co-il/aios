import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ConversationChannelStatus } from "@/lib/agentChannelRouting";
import { postChannel } from "./brainChannelApi";

/** Parliament controls for a brain channel conversation. */
export function useParliamentActions(
  tenantId: string | null,
  setStatus: Dispatch<SetStateAction<ConversationChannelStatus>>,
) {
  const cancelParliament = useCallback(
    async (conversationId: string | null) => {
      if (!tenantId || !conversationId) return;
      await postChannel({
        action: "cancel_parliament",
        tenant_id: tenantId,
        conversation_id: conversationId,
      });
      setStatus("idle");
    },
    [tenantId, setStatus],
  );

  const parliamentAction = useCallback(
    async (
      action:
        "parliament_continue" | "parliament_synthesize" | "parliament_clarify",
      conversationId: string | null,
      extra?: Record<string, string>,
    ) => {
      if (!tenantId || !conversationId) return;
      const res = await postChannel({
        action,
        tenant_id: tenantId,
        conversation_id: conversationId,
        ...(extra || {}),
      });
      const json = res.json;
      if (!res.ok) throw new Error(json.error || "פעולת פרלמנט נכשלה");
      if (json.status) setStatus(json.status);
      return json;
    },
    [tenantId, setStatus],
  );

  return { cancelParliament, parliamentAction };
}
