import { useEffect } from "react";
import type { BrainChannel } from "../useBrainChannel";
import { desiredRoute, pickStep } from "./brainPickDecision";

/** The parts of the sidecar's brain channel this hook uses. */
export type PickableBrain = Pick<
  BrainChannel,
  "routes" | "routesReady" | "selected" | "selectRoute" | "storedPick"
>;

/**
 * Opens an empty chat on the brain the user picked (their stored pick, on any
 * device), else on Carmen's internal brain. It runs when the session opens,
 * when the stored pick changes and after a reopened conversation, and always
 * waits for a quiet chat: switching brain clears the chat on screen. A brain
 * the user chose in this sidecar is never moved by it. It only selects for
 * this session; the stored pick changes in the brain selector.
 */
export function useApplyBrainPick(
  brain: PickableBrain,
  tenantId: string | null,
  quiet: boolean,
) {
  const { routes, routesReady, selected, selectRoute, storedPick } = brain;
  const { slug, ready, settled, followedRef } = storedPick;

  useEffect(() => {
    const stored = { tenantId, slug };
    const step = pickStep({
      ready: ready && routesReady,
      settled,
      quiet,
      stored,
      followed: followedRef.current,
    });
    if (step === "wait") {
      return;
    }

    followedRef.current = stored;
    const route = desiredRoute(routes, slug);
    // Already on the pick: selecting it again would only reset the channel status.
    if (step === "open" && route && route.slug !== selected.slug) {
      selectRoute(route);
    }
  }, [
    tenantId,
    slug,
    ready,
    settled,
    routesReady,
    quiet,
    routes,
    selected.slug,
    selectRoute,
    followedRef,
  ]);
}
