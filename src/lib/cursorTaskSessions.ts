import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * cursor_task_sessions is not in the generated types, so it is read through
 * an untyped client. Typed, its error text lists every table and changed with
 * each new one, which broke the typecheck baseline whenever two PRs that add
 * tables met in the merge queue.
 */
const untypedSupabase = supabase as unknown as SupabaseClient;

export type CursorTaskSession = {
  id: string;
  tenant_id: string;
  cursor_agent_id: string;
  session_url: string | null;
  display_name: string;
  human_task_id: string | null;
  task_title: string | null;
  source_tool: string;
  app_env: string | null;
  status: "running" | "completed" | "failed" | "busy";
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

export async function fetchActiveCursorSessions(
  tenantId: string,
): Promise<CursorTaskSession[]> {
  const { data, error } = await untypedSupabase
    .from("cursor_task_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["running", "busy"])
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data || []) as CursorTaskSession[];
}

export function useActiveCursorSessions(tenantId: string | null) {
  return useQuery({
    queryKey: ["cursor-task-sessions", tenantId],
    queryFn: () => fetchActiveCursorSessions(tenantId!),
    enabled: Boolean(tenantId),
    refetchInterval: 30_000,
  });
}
