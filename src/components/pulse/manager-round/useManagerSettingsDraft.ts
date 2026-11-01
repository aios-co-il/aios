import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { supabase } from "@/integrations/supabase/client";
import {
  parsePulseAlertRules,
  readCardLogSystemSends,
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
 * The owner-only manager settings while the alert rules dialog is open:
 * Carmen's mode and the client card logging switch. Both start from the stored
 * values on each open; `section` and `cardLog` are null for anyone the
 * database would refuse (carmen_manager_is_owner, also while that check
 * loads), and `save` sends them next to the edited rules only when the viewer
 * may change them.
 */
export function useManagerSettingsDraft(
  open: boolean,
  value: unknown,
  onSave: SavePulseAlertRules,
) {
  const { tenantId } = useCurrentTenant();
  const canManage = useIsManagerOwner(tenantId).data === true;
  const [mode, setMode] = useState<ManagerMode>(DEFAULT_MANAGER_MODE);
  const [cardLogSystemSends, setCardLogSystemSends] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(resolveManagerSettings(value).mode);
      setCardLogSystemSends(readCardLogSystemSends(value));
    }
  }, [open, value]);

  const section: ManagerModeSectionProps | null = canManage
    ? { mode, onChange: setMode }
    : null;
  const cardLog = canManage
    ? { checked: cardLogSystemSends, onCheckedChange: setCardLogSystemSends }
    : null;
  return {
    section,
    cardLog,
    save: (rules: PulseAlertRules) =>
      onSave(
        parsePulseAlertRules(rules),
        canManage ? { mode, card_log_system_sends: cardLogSystemSends } : {},
      ),
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
