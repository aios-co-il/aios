import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAgentHubAgents(tenantId: string | null | undefined) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ["ai-agents", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!selectedId && agents.length > 0) {
      const carmen = agents.find(
        (a) =>
          (a.name || "").toLowerCase().includes("carmen") ||
          a.name?.includes("כרמן"),
      );
      setSelectedId(carmen?.id || agents[0].id);
    }
  }, [agents, selectedId]);

  const selectedAgent = agents.find((a) => a.id === selectedId);

  return { agents, selectedId, setSelectedId, selectedAgent };
}
