import { skipToken, useQuery } from "@tanstack/react-query";
import { carmenFindingsKey, selectLiveFindings } from "@/lib/carmenFindings";

/** How many open findings the settings screen shows. */
export const OPEN_FINDINGS_LIMIT = 20;

/** The tenant's open findings, newest first (RLS limits them to what the viewer may see). */
export function useOpenFindings(tenantId: string | null) {
  return useQuery({
    queryKey: [...carmenFindingsKey(tenantId), "open"],
    queryFn: tenantId
      ? async () => {
          const { data, error } = await selectLiveFindings(
            tenantId,
            "id, short_code, kind, severity, summary_he, status",
          ).limit(OPEN_FINDINGS_LIMIT);
          if (error) {
            throw error;
          }
          return data;
        }
      : skipToken,
  });
}
