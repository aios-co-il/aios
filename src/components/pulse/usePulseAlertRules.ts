import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The tenant's pulse_alert_rules, so the dashboard judges campaigns without a
 * target with the cost thresholds (manager.cost) the snapshot used; null until
 * read. The key sits under heartbeat_settings, so saving the rules in the
 * Heartbeat settings refreshes it.
 */
export function usePulseAlertRules(tenantId: string | null | undefined) {
  const { data = null } = useQuery({
    queryKey: ["heartbeat_settings", tenantId, "pulse_alert_rules"],
    queryFn: tenantId
      ? async () => {
          const { data: settings, error } = await supabase
            .from("tenant_heartbeat_settings")
            .select("pulse_alert_rules")
            .eq("tenant_id", tenantId)
            .maybeSingle();
          if (error) {
            throw error;
          }
          return settings?.pulse_alert_rules ?? null;
        }
      : skipToken,
    staleTime: 300_000,
  });
  return data;
}
