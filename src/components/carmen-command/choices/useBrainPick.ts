import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
} from "react";
import type {
  BrainRoute,
  ConversationChannelStatus,
} from "@/lib/agentChannelRouting";
import { postChannel } from "../brainChannelApi";
import type { FollowedPick } from "./brainPickDecision";
import { useCarmenChoices } from "./useCarmenChoices";

/** The sidecar's brain selection state, owned by useBrainChannel. */
interface BrainSelection {
  tenantId: string | null;
  selectedRef: MutableRefObject<BrainRoute>;
  setSelected: Dispatch<SetStateAction<BrainRoute>>;
  setStatus: Dispatch<SetStateAction<ConversationChannelStatus>>;
}

/**
 * The two ways the sidecar's brain changes. `selectRoute` moves this session
 * only: a reopened conversation and the session default use it. `pickRoute` is
 * the user's own choice in the brain selector, stored on their row so every
 * device opens on it; in this sidecar it stands whatever the row answers.
 */
export function useBrainPick({
  tenantId,
  selectedRef,
  setSelected,
  setStatus,
}: BrainSelection) {
  const { brainSlug, ready, settled, saveBrain } = useCarmenChoices(tenantId);
  // What this session does with the stored pick; useApplyBrainPick acts on it.
  const followedRef = useRef<FollowedPick>(null);

  const selectRoute = useCallback(
    (route: BrainRoute, conversationId?: string | null) => {
      selectedRef.current = route;
      setSelected(route);
      setStatus("idle");
      if (!conversationId) {
        return;
      }

      // The conversation runs on its own brain; the next empty chat returns
      // to the stored pick.
      followedRef.current = null;
      if (tenantId) {
        void recordConversationRoute(tenantId, route, conversationId);
      }
    },
    [tenantId, selectedRef, setSelected, setStatus],
  );

  const pickRoute = useCallback(
    (route: BrainRoute) => {
      selectRoute(route);
      followedRef.current = { tenantId, ownPick: true };
      saveBrain(route.slug);
    },
    [tenantId, selectRoute, saveBrain],
  );

  return {
    selectRoute,
    pickRoute,
    storedPick: { slug: brainSlug, ready, settled, followedRef },
  };
}

/**
 * Records the brain on the conversation's own row, so reopening it finds its
 * brain. The selection is already made on screen, so a failure is only logged.
 */
async function recordConversationRoute(
  tenantId: string,
  route: BrainRoute,
  conversationId: string,
): Promise<void> {
  const notRecorded =
    "[useBrainPick] the conversation's brain was not recorded";

  try {
    const response = await postChannel({
      action: "select_route",
      tenant_id: tenantId,
      brain_route_id: route.id,
      brain_slug: route.slug,
      conversation_id: conversationId,
    });
    if (!response.ok) {
      console.warn(notRecorded, response.status, response.json.error);
    }
  } catch (error) {
    console.warn(notRecorded, error);
  }
}
