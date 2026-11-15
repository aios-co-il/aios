import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  CARMEN_AGENT_FILTER,
  pickActiveCarmenAgent,
  pickCarmenAgent,
} from "../../supabase/functions/_shared/carmen/carmen-agent.ts";

/** Enough rows to hold every Carmen candidate a tenant has. */
const CANDIDATE_LIMIT = 50;

/**
 * The tenant's Carmen agent, picked by the same flag-first rule as the edge functions
 * (`carmen-agent.ts`, AIO-592). With `activeOnly`, null when she is inactive. Throws on a failed
 * read, for React Query.
 */
export async function fetchCarmenAgent(
  tenantId: string,
  { activeOnly }: { activeOnly: boolean },
): Promise<Tables<"ai_agents"> | null> {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(CARMEN_AGENT_FILTER)
    .limit(CANDIDATE_LIMIT);
  if (error) {
    throw error;
  }
  return activeOnly ? pickActiveCarmenAgent(data) : pickCarmenAgent(data);
}
