import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FINDING_LIVE_STATUSES } from "../../../../supabase/functions/_shared/manager-round/kinds.ts";

/** How many open findings the settings screen shows. */
export const OPEN_FINDINGS_LIMIT = 20;

/** The tenant's open findings, newest first (RLS limits them to what the viewer may see). */
export function useOpenFindings(tenantId: string | null) {
  return useQuery({
    queryKey: ["carmen_findings", tenantId, "open"],
    queryFn: tenantId
      ? async () => {
          const { data, error } = await supabase
            .from("carmen_findings")
            .select("id, short_code, kind, severity, summary_he, status")
            .eq("tenant_id", tenantId)
            .in("status", [...FINDING_LIVE_STATUSES])
            .order("last_seen_at", { ascending: false })
            .limit(OPEN_FINDINGS_LIMIT);
          if (error) {
            throw error;
          }
          return data;
        }
      : skipToken,
  });
}
