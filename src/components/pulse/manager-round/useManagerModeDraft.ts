import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import {
  parsePulseAlertRules,
  type PulseAlertRules,
  type SavePulseAlertRules,
} from "@/lib/pulseAlertRules";
import type { ManagerMode } from "../../../../supabase/functions/_shared/manager-round/modes.ts";
import { resolveManagerSettings } from "../../../../supabase/functions/_shared/manager-round/settings.ts";
import type { ManagerModeSectionProps } from "./ManagerModeSection";

/**
 * Carmen's manager mode while the alert rules dialog is open: it starts from
 * the stored mode on each open, `section` is null for anyone but an owner
 * (the database refuses their manager changes), and `save` sends the mode
 * next to the edited rules only when the viewer may change it.
 */
export function useManagerModeDraft(
  open: boolean,
  value: unknown,
  onSave: SavePulseAlertRules,
) {
  const { isOwner, isAgencyOwner, isSuperAdmin } = useUserRole();
  const canManage = isOwner || isAgencyOwner || isSuperAdmin;
  const [mode, setMode] = useState<ManagerMode>("observe");

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
