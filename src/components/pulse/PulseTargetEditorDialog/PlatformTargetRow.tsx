import { goalLabel } from "@/lib/pulseDashboard";
import {
  pulseTargetSaveKey,
  type PulseTargetSaveInput,
} from "@/components/pulse/pulseTargetSave";
import { formatPulseTargetValue } from "@/components/pulse/formatPulseTargetValue";
import { pulsePlatformName } from "../../../../supabase/functions/_shared/pulse/platforms.ts";
import {
  pulseTargetKindsForGoal,
  type PulseTarget,
  type PulseTargetGoal,
} from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import type { PulseTargetEditorContext } from "./PulseTargetEditorDialog";
import { TargetRow } from "./TargetRow";
import { inheritedFrom } from "./targetFormat";

type PlatformTargetRowProps = {
  context: PulseTargetEditorContext;
  goal: PulseTargetGoal;
  tableIds: string[];
  target: PulseTarget | null;
  savingKey: string | null;
  onSave: (input: PulseTargetSaveInput) => void;
};

/**
 * The platform target of every campaign of the goal, saved to every report table
 * of the client × platform, with the 4-week baseline as a hint.
 */
export function PlatformTargetRow({
  context,
  goal,
  tableIds,
  target,
  savingKey,
  onSave,
}: PlatformTargetRowProps) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">יעד לפלטפורמה</div>
      <TargetRow
        title={`כל קמפייני ה${goalLabel(goal)} ב־${pulsePlatformName(context.platform)}`}
        subtitle={
          context.baselineEfficiency7d
            ? `בסיס 4 שבועות: ${formatPulseTargetValue(
                pulseTargetKindsForGoal(goal)[0] ?? "cpl",
                context.baselineEfficiency7d,
              )}`
            : undefined
        }
        goal={goal}
        target={target}
        // Legacy report-settings targets are shown, not removed here.
        inherited={inheritedFrom(target, "platform")}
        saving={savingKey === pulseTargetSaveKey({ tableIds })}
        onSave={(kind, value) => onSave({ tableIds, goal, kind, value })}
      />
    </div>
  );
}
