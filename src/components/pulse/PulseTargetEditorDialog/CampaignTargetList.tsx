import { formatPulseMoney, goalLabel } from "@/lib/pulseDashboard";
import {
  pulseTargetSaveKey,
  type PulseTargetSaveInput,
} from "@/lib/pulseTargetSave";
import { formatPulseTargetValue } from "@/components/pulse/formatPulseTargetValue";
import { TargetRow } from "./TargetRow";
import type { CampaignTargetRow } from "./useCampaignTargetRows";

type CampaignTargetListProps = {
  rows: CampaignTargetRow[];
  savingKey: string | null;
  onSave: (input: PulseTargetSaveInput) => void;
};

/** One target row per spending lead or ecommerce campaign, saved where its target is stored. */
export function CampaignTargetList({
  rows,
  savingKey,
  onSave,
}: CampaignTargetListProps) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">יעדים לקמפיינים</div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          אין קמפייני לידים או איקומרס עם הוצאה ב־7 הימים האחרונים
        </p>
      ) : (
        rows.map(({ row, goal, target, inherited, saveTo }) => {
          const save = { ...saveTo, campaignName: row.campaign_name };
          return (
            <TargetRow
              key={row.campaign_key}
              title={row.campaign_name}
              subtitle={campaignSubtitle(row, goal)}
              goal={goal}
              target={target}
              inherited={inherited}
              saving={savingKey === pulseTargetSaveKey(save)}
              onSave={(kind, value) => onSave({ ...save, goal, kind, value })}
            />
          );
        })
      )}
    </div>
  );
}

/** "לידים · הוצאה 7 ימים ₪900 · נוכחי ₪75": the goal, spend and current efficiency. */
function campaignSubtitle(
  row: CampaignTargetRow["row"],
  goal: CampaignTargetRow["goal"],
): string {
  const current =
    row.efficiency_7d !== null
      ? ` · נוכחי ${formatPulseTargetValue(
          goal === "ecommerce" && row.target_kind !== "cpa" ? "roas" : "cpl",
          row.efficiency_7d,
        )}`
      : "";
  return `${goalLabel(goal)} · הוצאה 7 ימים ${formatPulseMoney(row.spend_7d)}${current}`;
}
