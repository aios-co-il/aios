import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { supabase } from "@/integrations/supabase/client";
import {
  parsePulseAlertRules,
  type PulseAlertRules,
  type SavePulseAlertRules,
} from "@/lib/pulseAlertRules";
import {
  DEFAULT_MANAGER_MODE,
  type ManagerMode,
} from "../../../../supabase/functions/_shared/manager-round/modes.ts";
import { resolveManagerSettings } from "../../../../supabase/functions/_shared/manager-round/settings.ts";
import type { ManagerModeSectionProps } from "./ManagerModeSection";

/**
 * Carmen's manager mode while the alert rules dialog is open: it starts from
 * the stored mode on each open, `section` is null for anyone the database
 * would refuse (carmen_manager_is_owner, also while that check loads), and
 * `save` sends the mode next to the edited rules only when the viewer may
 * change it.
 */
export function useManagerModeDraft(
  open: boolean,
  value: unknown,
  onSave: SavePulseAlertRules,
) {
  const { tenantId } = useCurrentTenant();
  const canManage = useIsManagerOwner(tenantId).data === true;
  const [mode, setMode] = useState<ManagerMode>(DEFAULT_MANAGER_MODE);

  useEffect(() => {
    if (open) {
      setMode(resolveManagerSettings(value).mode);
    }
  }, [open, value]);

  const section: ManagerModeSectionProps | null = canManage
    ? { mode, onChange: setMode }
    : null;
  return {
    section,
    save: (rules: PulseAlertRules) =>
      onSave(parsePulseAlertRules(rules), canManage ? { mode } : {}),
  };
}

/** Whether the viewer may change the tenant's manager settings: the database's own rule. */
function useIsManagerOwner(tenantId: string | null) {
  return useQuery({
    queryKey: ["carmen_manager_is_owner", tenantId],
    queryFn: tenantId
      ? async () => {
          const { data, error } = await supabase.rpc(
            "carmen_manager_is_owner",
            { p_tenant_id: tenantId },
          );
          if (error) {
            throw error;
          }
          return data;
        }
      : skipToken,
  });
}
