import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  PulseCampaignGoal,
  PulseCampaignGoalRow,
} from "@/lib/pulseCampaignGoals";
import type { PulseTargetSaveInput } from "@/lib/pulseTargetSave";
import {
  pulsePlatformName,
  type PulsePlatform,
} from "../../../../supabase/functions/_shared/pulse/platforms.ts";
import { isPulseTargetGoal } from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import { resolvePulseTargetAcross } from "../../../../supabase/functions/_shared/pulse/targets/resolve.ts";
import { CampaignTargetList } from "./CampaignTargetList";
import { PlatformTargetRow } from "./PlatformTargetRow";
import { useCampaignTargetRows } from "./useCampaignTargetRows";

/** The client × platform the editor is open for. */
export type PulseTargetEditorContext = {
  clientId: string;
  clientName: string;
  platform: PulsePlatform;
  primaryGoal: PulseCampaignGoal;
  /** Every report table of this client × platform; a platform target goes to all. */
  platformTableIds: string[];
  baselineEfficiency7d?: number | null;
};

type PulseTargetEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PulseTargetEditorContext | null;
  /** Campaigns of this client × platform with spend in the last 7 days. */
  campaigns: PulseCampaignGoalRow[];
  tableSettingsById: Map<string, Record<string, unknown>>;
  /** integration_type of each report table, so a tie between duplicate Meta tables breaks as in the pulse. */
  tableTypeById?: Map<string, string | null>;
  /** pulseTargetSaveKey of the row being saved, while a save runs. */
  savingKey: string | null;
  onSave: (input: PulseTargetSaveInput) => void;
};

/**
 * Targets for one client × platform: the platform target and one row per campaign
 * (CPL for lead campaigns, ROAS or CPA for ecommerce). Anything saved here is an
 * approved target, so it also replaces a market target Carmen set.
 */
export function PulseTargetEditorDialog({
  open,
  onOpenChange,
  context,
  campaigns,
  tableSettingsById,
  tableTypeById,
  savingKey,
  onSave,
}: PulseTargetEditorDialogProps) {
  // Remount the rows when the dialog opens for another client so drafts reset.
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => {
    if (open) {
      setOpenedAt(Date.now());
    }
  }, [open, context?.clientId, context?.platform]);

  const platformGoal =
    context && isPulseTargetGoal(context.primaryGoal)
      ? context.primaryGoal
      : null;
  const platformTableIds = useMemo(
    () => context?.platformTableIds ?? [],
    [context?.platformTableIds],
  );
  // The pulse reads a platform target from any of the platform's tables.
  const platformTarget = useMemo(
    () =>
      platformGoal
        ? resolvePulseTargetAcross(
            platformTableIds.map((tableId) => ({
              tableId,
              integrationType: tableTypeById?.get(tableId) ?? null,
              settings: tableSettingsById.get(tableId) ?? {},
            })),
            platformGoal,
          )
        : null,
    [platformTableIds, platformGoal, tableSettingsById, tableTypeById],
  );
  const campaignRows = useCampaignTargetRows(campaigns, tableSettingsById);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            יעדים — {context?.clientName}{" "}
            {context ? `· ${pulsePlatformName(context.platform)}` : ""}
          </DialogTitle>
          <DialogDescription>
            יעד שנשמר כאן הוא יעד מאושר: הוא מחליף יעד שוק שכרמן קבעה וגובר עליו
            בכל רמה. יעד מאושר של קמפיין גובר על יעד הפלטפורמה.
          </DialogDescription>
        </DialogHeader>

        {context ? (
          <div className="space-y-4 py-1" key={openedAt}>
            {platformTableIds.length > 0 && platformGoal ? (
              <PlatformTargetRow
                context={context}
                goal={platformGoal}
                tableIds={platformTableIds}
                target={platformTarget}
                savingKey={savingKey}
                onSave={onSave}
              />
            ) : null}
            <CampaignTargetList
              rows={campaignRows}
              savingKey={savingKey}
              onSave={onSave}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
