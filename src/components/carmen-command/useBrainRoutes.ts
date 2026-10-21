import { useEffect, useRef, useState } from "react";
import { useViewAs } from "@/contexts/ViewAsContext";
import {
  FALLBACK_BRAIN_ROUTES,
  initialSelectedRoute,
  pickDefaultRoute,
  type BrainRoute,
  type ChannelHealth,
} from "@/lib/agentChannelRouting";
import { fetchBrainRoutes, fetchChannelHealth } from "./brainChannelApi";

/** Loads the tenant's brain routes and channel health, tracking the selection. */
export function useBrainRoutes(tenantId: string | null) {
  const [routes, setRoutes] = useState<BrainRoute[]>(FALLBACK_BRAIN_ROUTES);
  const [selected, setSelected] = useState<BrainRoute>(() =>
    initialSelectedRoute(),
  );
  const [noBrainAccess, setNoBrainAccess] = useState(false);
  const [channelHealth, setChannelHealth] = useState<ChannelHealth | null>(
    null,
  );
  const { viewAsUserId } = useViewAs();
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { list, restricted } = await fetchBrainRoutes(
          tenantId,
          viewAsUserId,
        );
        setRoutes(list);
        setNoBrainAccess(restricted && list.length === 0);
        if (list.length)
          setSelected(
            (prev) =>
              list.find((r) => r.slug === prev.slug) || pickDefaultRoute(list),
          );
      } catch {
        setSelected((prev) =>
          pickDefaultRoute(FALLBACK_BRAIN_ROUTES, prev.slug),
        );
      }
      try {
        const health = await fetchChannelHealth(tenantId);
        if (health) setChannelHealth(health);
      } catch {
        /* health is advisory */
      }
    })();
  }, [tenantId, viewAsUserId]);

  return {
    routes,
    selected,
    setSelected,
    selectedRef,
    noBrainAccess,
    channelHealth,
  };
}
