import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Read connections for the selected agent and its tenant. */
export function useMcpConnections(agentId: string, tenantId: string | null) {
  return useQuery({
    queryKey: ["mcp-connections", agentId, tenantId],
    queryFn: tenantId
      ? async () => {
          const { data } = await supabase
            .from("agent_mcp_connections")
            .select("*")
            .filter("tenant_id", "eq", tenantId)
            .or(`agent_id.eq.${agentId},agent_id.is.null`)
            .order("created_at", { ascending: false });
          return data ?? [];
        }
      : skipToken,
  });
}

/** Read potential children within the selected supervisor's tenant. */
export function useSupervisorCandidates(
  agentId: string,
  tenantId: string | null,
) {
  return useQuery({
    queryKey: ["ai-agents", tenantId],
    queryFn: tenantId
      ? async () => {
          const { data } = await supabase
            .from("ai_agents")
            .select("id, name, talent")
            .filter("tenant_id", "eq", tenantId)
            .neq("id", agentId);
          return data ?? [];
        }
      : skipToken,
  });
}

/** Poll steps only after a run has been selected. */
export function useAgentRunSteps(selectedRunId: string | null) {
  return useQuery({
    queryKey: ["agent-run-steps", selectedRunId],
    queryFn: selectedRunId
      ? async () => {
          const { data } = await supabase
            .from("agent_action_log")
            .select("*")
            .filter("run_id", "eq", selectedRunId)
            .order("step_index", { ascending: true });
          return data ?? [];
        }
      : skipToken,
    refetchInterval: 3000,
  });
}
