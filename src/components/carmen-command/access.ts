import { useQuery } from "@tanstack/react-query";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { resolveCommandCenterAccess } from "./carmenAccessApi";

export { COMMAND_CENTER_ALLOWLIST } from "./carmenAccessApi";

export const COMMAND_CENTER_ACCESS_KEY = "cc-access";

/** Whether the current (or "view as") user may open Carmen. Cached and shared. */
export function useCommandCenterAccess(): {
  allowed: boolean;
  loading: boolean;
} {
  const { viewAsUserId } = useViewAs();
  const { tenantId } = useCurrentTenant();
  const query = useQuery({
    queryKey: [
      COMMAND_CENTER_ACCESS_KEY,
      tenantId ?? null,
      viewAsUserId ?? null,
    ],
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      resolveCommandCenterAccess(tenantId ?? null, viewAsUserId ?? null),
  });
  return { allowed: query.data ?? false, loading: query.isLoading };
}
