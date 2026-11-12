import { skipToken, useQuery } from "@tanstack/react-query";
import { useOptionalTenant } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { findPersona } from "./carmenPersonas";
import { loadChoice, loadPersonas } from "./personaQueries";
import { choiceQueryKey, personasKey } from "./useCarmenPersonas";

/**
 * The character the signed-in user picked in the current org, or null while
 * unknown or when they have not picked one (the org's default look applies).
 */
export function useActivePersona() {
  const tenantId = useOptionalTenant()?.currentTenantId;
  const { userId } = useCurrentUser();
  const choice = useQuery({
    queryKey: choiceQueryKey(tenantId, userId),
    staleTime: 30 * 60 * 1000,
    queryFn:
      tenantId && userId ? () => loadChoice(tenantId, userId) : skipToken,
  });
  const list = useQuery({
    queryKey: personasKey(tenantId),
    staleTime: 30 * 60 * 1000,
    queryFn: tenantId && choice.data ? () => loadPersonas(tenantId) : skipToken,
  });
  return list.data ? findPersona(list.data, choice.data) : null;
}
