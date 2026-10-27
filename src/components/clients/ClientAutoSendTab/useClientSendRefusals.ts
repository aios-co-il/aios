import { skipToken, useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { clientAutoSendKey } from "./useClientAutoSendOptIns";

/** How far back the card lists refused sends. */
export const REFUSALS_WINDOW_DAYS = 30;

// Observed refusals repeat for every unstamped send, so the card shows the
// newest ones rather than paging through the whole window.
const REFUSALS_LIMIT = 50;

export type ClientSendRefusalRow = {
  id: string;
  created_at: string;
  reason: string;
  enforced: boolean;
};

/** Automatic sends to this client the guard refused or would refuse. */
export function useClientSendRefusals(clientId: string | null | undefined) {
  return useQuery({
    queryKey: [...clientAutoSendKey(clientId), "refusals"],
    queryFn: clientId ? () => fetchRefusals(clientId) : skipToken,
  });
}

/** Reads the newest refusals of the window. */
async function fetchRefusals(
  clientId: string,
): Promise<ClientSendRefusalRow[]> {
  const { data, error } = await supabase
    .from("client_send_refusals")
    .select("id, created_at, reason, enforced")
    .eq("client_id", clientId)
    .gte("created_at", subDays(new Date(), REFUSALS_WINDOW_DAYS).toISOString())
    .order("created_at", { ascending: false })
    .limit(REFUSALS_LIMIT);
  if (error) {
    throw error;
  }
  return data ?? [];
}
