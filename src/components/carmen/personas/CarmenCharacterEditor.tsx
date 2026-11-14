import { skipToken, useQuery } from "@tanstack/react-query";
import { AgentVisualIdentity } from "@/components/agents/AgentVisualIdentity";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { fetchCarmenAgent } from "@/lib/carmenAgent";

/**
 * The same character-image editor Carmen's profile shows, for screens that do
 * not have Carmen's agent row at hand (the personal area).
 */
export function CarmenCharacterEditor() {
  const { tenantId } = useCurrentTenant();
  const { data: agent } = useQuery({
    queryKey: ["carmen-agent-identity-row", tenantId],
    queryFn: tenantId
      ? () => fetchCarmenAgent(tenantId, { activeOnly: false })
      : skipToken,
  });
  return agent ? <AgentVisualIdentity agent={agent} /> : null;
}
