import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { toast } from "sonner";
import { toAgentGoal, type AgentGoal } from "@/lib/agentGoalRows";

export type { AgentGoal };

export function useAgentGoals(agentId: string | null) {
  return useQuery({
    queryKey: ["agent-goals", agentId],
    enabled: !!agentId,
    queryFn: async (): Promise<AgentGoal[]> => {
      const { data, error } = await supabase
        .from("agent_goals")
        .select("*")
        .eq("agent_id", agentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toAgentGoal);
    },
  });
}

export function useAgentGoalMutations(agentId: string | null) {
  const qc = useQueryClient();
  const { tenantId } = useCurrentTenant();

  const create = useMutation({
    mutationFn: async (input: Partial<AgentGoal>) => {
      if (!agentId || !tenantId) throw new Error("missing agent/tenant");
      const { error } = await supabase.from("agent_goals").insert({
        agent_id: agentId,
        tenant_id: tenantId,
        title: input.title!,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        status: input.status ?? "active",
        target_date: input.target_date ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-goals", agentId] });
      toast.success("מטרה נוספה");
    },
    onError: (e) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<AgentGoal> & { id: string }) => {
      const { error } = await supabase
        .from("agent_goals")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["agent-goals", agentId] }),
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_goals")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-goals", agentId] });
      toast.success("נמחק");
    },
    onError: (e) => toast.error(e.message),
  });

  return { create, update, remove };
}
