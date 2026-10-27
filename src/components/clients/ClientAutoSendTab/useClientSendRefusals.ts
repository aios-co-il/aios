import { skipToken, useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { clientAutoSendKey } from "./useClientAutoSendOptIns";

/** How far back the card lists refused sends. */
export const REFUSALS_WINDOW_DAYS = 30;

// Observed refusals repeat for every Carmen reply or unstamped send, so the
// card reads a bounded window, blocked sends first, and groups it by reason.
const REFUSALS_LIMIT = 200;

export type ClientSendRefusalRow = {
  id: string;
  created_at: string;
  reason: string;
  enforced: boolean;
};

/** Refusals of one reason and status: how many, and the newest. */
export type ClientSendRefusalGroup = {
  reason: string;
  enforced: boolean;
  count: number;
  latest: string;
};

/**
 * Automatic sends to this client the guard refused or would refuse, one
 * entry per reason and status, blocked ones first.
 */
export function useClientSendRefusals(clientId: string | null | undefined) {
  return useQuery({
    queryKey: [...clientAutoSendKey(clientId), "refusals"],
    queryFn: clientId ? () => fetchRefusals(clientId) : skipToken,
    select: groupRefusals,
  });
}

/**
 * Groups rows that arrive blocked first and newest first; each group keeps
 * the position and the time of its newest row.
 */
export function groupRefusals(
  rows: ClientSendRefusalRow[],
): ClientSendRefusalGroup[] {
  const groups = new Map<string, ClientSendRefusalGroup>();
  for (const row of rows) {
    const key = `${row.enforced}:${row.reason}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
    } else {
      groups.set(key, {
        reason: row.reason,
        enforced: row.enforced,
        count: 1,
        latest: row.created_at,
      });
    }
  }
  return [...groups.values()];
}

/** Reads the window's rows, blocked ones first, each status newest first. */
async function fetchRefusals(
  clientId: string,
): Promise<ClientSendRefusalRow[]> {
  const { data, error } = await supabase
    .from("client_send_refusals")
    .select("id, created_at, reason, enforced")
    .eq("client_id", clientId)
    .gte("created_at", subDays(new Date(), REFUSALS_WINDOW_DAYS).toISOString())
    .order("enforced", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(REFUSALS_LIMIT);
  if (error) {
    throw error;
  }
  return data ?? [];
}
