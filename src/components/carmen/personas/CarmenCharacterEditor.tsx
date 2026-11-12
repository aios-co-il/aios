import { skipToken, useQuery } from "@tanstack/react-query";
import { AgentVisualIdentity } from "@/components/agents/AgentVisualIdentity";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

/**
 * The same character-image editor Carmen's profile shows, for screens that do
 * not have Carmen's agent row at hand (the personal area).
 */
export function CarmenCharacterEditor() {
  const { tenantId } = useCurrentTenant();
  const { data: agent } = useQuery({
    queryKey: ["carmen-agent-identity-row", tenantId],
    queryFn: tenantId ? () => loadCarmenAgent(tenantId) : skipToken,
  });
  return agent ? <AgentVisualIdentity agent={agent} /> : null;
}

/** The org's Carmen agent, found by name like `useCarmenIdentity`. */
async function loadCarmenAgent(tenantId: string) {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("id,tenant_id,name,metadata")
    .eq("tenant_id", tenantId)
    .or("name.ilike.%carmen%,name.ilike.%כרמן%")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
