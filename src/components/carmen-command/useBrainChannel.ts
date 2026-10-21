import { useCallback, useState } from "react";
import {
  channelHealthBanner,
  isInputLocked,
  sendPathForRoute,
  storageKeyForRoute,
  type BrainRoute,
  type ConversationChannelStatus,
} from "@/lib/agentChannelRouting";
import {
  postChannel,
  type ChannelSendArgs,
  type ChannelSendResult,
} from "./brainChannelApi";
import { useBrainRoutes } from "./useBrainRoutes";
import { useParliamentActions } from "./useParliamentActions";

export type { ChannelSendResult } from "./brainChannelApi";

export function useBrainChannel(tenantId: string | null) {
  const {
    routes,
    selected,
    setSelected,
    selectedRef,
    noBrainAccess,
    channelHealth,
  } = useBrainRoutes(tenantId);
  const [status, setStatus] = useState<ConversationChannelStatus>("idle");
  const [externalUrl, setExternalUrl] = useState<string | null>(null);

  const selectRoute = useCallback(
    async (route: BrainRoute, conversationId?: string | null) => {
      selectedRef.current = route;
      setSelected(route);
      setStatus("idle");
      if (tenantId)
        localStorage.setItem(storageKeyForRoute(tenantId), route.slug);
      if (!tenantId) return;
      try {
        await postChannel({
          action: "select_route",
          tenant_id: tenantId,
          brain_route_id: route.id,
          brain_slug: route.slug,
          conversation_id: conversationId || undefined,
        });
      } catch {
        /* selection is local-first */
      }
    },
    [tenantId, selectedRef, setSelected],
  );

  const send = useCallback(
    async (args: ChannelSendArgs): Promise<ChannelSendResult> => {
      if (!tenantId) throw new Error("missing tenant");
      const route = args.route || selectedRef.current;
      const res = await postChannel({
        action: "send",
        tenant_id: tenantId,
        content: args.content,
        conversation_id: args.conversationId,
        brain_route_id: route.id,
        brain_slug: route.slug,
        input_mode: args.inputMode,
        conversation_history: args.history,
        idempotency_key: args.idempotencyKey,
        context_metadata: args.contextMetadata ?? undefined,
        attachments: args.attachments?.length ? args.attachments : undefined,
      });
      const json = res.json;
      if (!res.ok) {
        if (
          sendPathForRoute(route) === "internal_stream" &&
          (res.status === 404 || res.status === 500)
        ) {
          return {
            ok: true,
            kind: "internal",
            conversation_id: args.conversationId || "",
            status: "streaming",
            stream: true,
            accepted_message: "",
          };
        }
        throw new Error(json.error || "שגיאה בשליחה לערוץ");
      }
      const result = json as ChannelSendResult;
      setStatus(result.status);
      setExternalUrl(result.external_url || null);
      return result;
    },
    [tenantId, selectedRef],
  );

  const persistAssistant = useCallback(
    async (conversationId: string, content: string, idempotencyKey: string) => {
      if (!tenantId || !conversationId || !content) return;
      try {
        await postChannel({
          action: "persist_assistant",
          tenant_id: tenantId,
          conversation_id: conversationId,
          content,
          idempotency_key: idempotencyKey,
        });
        setStatus("idle");
      } catch {
        /* best-effort */
      }
    },
    [tenantId],
  );

  const { cancelParliament, parliamentAction } = useParliamentActions(
    tenantId,
    setStatus,
  );

  return {
    routes,
    selected,
    selectRoute,
    noBrainAccess,
    status,
    setStatus,
    externalUrl,
    setExternalUrl,
    locked:
      isInputLocked(status) && sendPathForRoute(selected) !== "internal_stream",
    send,
    persistAssistant,
    cancelParliament,
    parliamentAction,
    sendPath: sendPathForRoute(selected),
    channelHealth,
    healthBanner: channelHealthBanner(channelHealth),
  };
}

export type BrainChannel = ReturnType<typeof useBrainChannel>;
