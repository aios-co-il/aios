import { useEffect, useRef, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useViewAs } from "@/contexts/ViewAsContext";
import {
  FALLBACK_BRAIN_ROUTES,
  initialSelectedRoute,
  pickDefaultRoute,
  type BrainRoute,
} from "@/lib/agentChannelRouting";
import { fetchBrainRoutes, fetchChannelHealth } from "./brainChannelApi";

/** Loads the tenant's brain routes and channel health, tracking the selection. */
export function useBrainRoutes(tenantId: string | null) {
  const [selected, setSelected] = useState<BrainRoute>(() =>
    initialSelectedRoute(),
  );
  const { viewAsUserId } = useViewAs();
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const routesQuery = useQuery({
    queryKey: ["brain-routes", tenantId, viewAsUserId ?? null],
    queryFn: tenantId
      ? () => fetchBrainRoutes(tenantId, viewAsUserId)
      : skipToken,
    retry: false,
  });
  const healthQuery = useQuery({
    queryKey: ["brain-channel-health", tenantId],
    queryFn: tenantId ? () => fetchChannelHealth(tenantId) : skipToken,
    retry: false, // health is advisory
  });

  // Keep the selection on a brain the user may still use.
  const { data, isError } = routesQuery;
  useEffect(() => {
    if (data?.list.length)
      setSelected(
        (prev) =>
          data.list.find((r) => r.slug === prev.slug) ||
          pickDefaultRoute(data.list),
      );
    else if (isError)
      setSelected((prev) => pickDefaultRoute(FALLBACK_BRAIN_ROUTES, prev.slug));
  }, [data, isError]);

  const list = data?.list ?? FALLBACK_BRAIN_ROUTES;
  return {
    routes: list,
    selected,
    setSelected,
    selectedRef,
    noBrainAccess: !!data?.restricted && list.length === 0,
    channelHealth: healthQuery.data ?? null,
  };
}
