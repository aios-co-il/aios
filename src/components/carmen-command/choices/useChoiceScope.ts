import { useMemo } from "react";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ChoiceScope } from "./carmenChoiceQueries";

/**
 * Whose Carmen picks this session reads and writes in the org: the signed-in
 * user's own row, or in "view as" a session-only entry for the colleague
 * being previewed (the admin's own row is neither read nor written there).
 */
export function useChoiceScope(tenantId: string | null) {
  const { userId } = useCurrentUser();
  const { viewAsUserId, isViewingAs } = useViewAs();
  const scope = useMemo<ChoiceScope>(
    () => ({ tenantId, userId: userId ?? null, viewAsUserId }),
    [tenantId, userId, viewAsUserId],
  );

  return { scope, sessionOnly: isViewingAs };
}
