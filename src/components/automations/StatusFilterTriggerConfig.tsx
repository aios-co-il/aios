import { Label } from "@/components/ui/label";
import {
  cfgString,
  type StepConfig,
  type StepConfigBulkChange,
  type StepConfigChange,
} from "@/lib/automationStepConfig";
import {
  decodeStatusSelection,
  encodeStoredTriggerFilters,
  triggerScope,
} from "../../../supabase/functions/_shared/automation-status.ts";
import { StatusStageMultiSelect } from "./StatusStageSelect";

interface StatusFilterTriggerConfigProps {
  triggerType: string;
  tenantId?: string;
  configuration: StepConfig;
  onConfigChange: StepConfigChange;
  onBulkConfigChange?: StepConfigBulkChange;
}

export default function StatusFilterTriggerConfig({
  triggerType,
  tenantId,
  configuration,
  onConfigChange,
  onBulkConfigChange,
}: StatusFilterTriggerConfigProps) {
  const scope = triggerScope(triggerType) || "lead";
  const selected = encodeStoredTriggerFilters({
    filter_statuses: configuration?.filter_statuses,
    filter_status: cfgString(configuration?.filter_status),
    filter_status_kind: cfgString(configuration?.filter_status_kind),
  });

  const write = (updates: StepConfig) => {
    if (onBulkConfigChange) {
      onBulkConfigChange(updates);
      return;
    }
    for (const [key, value] of Object.entries(updates)) {
      onConfigChange(key, value);
    }
  };

  return (
    <div className="space-y-2 bg-muted/40 border rounded-lg p-3" dir="rtl">
      <Label className="text-right block text-sm font-semibold">
        סטטוסים ושלבים (אפשר כמה)
      </Label>
      <StatusStageMultiSelect
        tenantId={tenantId}
        scopes={[scope]}
        value={selected}
        onChange={(encodedValues) => {
          const parsed = encodedValues
            .map((encoded) => decodeStatusSelection(encoded))
            .filter((item) => item.value && item.value !== "any");
          if (parsed.length === 0) {
            write({
              filter_statuses: [],
              filter_status: "any",
              filter_status_kind: null,
            });
            return;
          }
          write({
            filter_statuses: parsed.map((item) => ({
              value: item.value,
              kind: item.kind,
            })),
            filter_status: parsed[0].value,
            filter_status_kind: parsed[0].kind,
          });
        }}
      />
      <p className="text-xs text-muted-foreground text-right">
        אותה פעולה תרוץ אם הסטטוס או השלב הוא אחד מהנבחרים. בלי בחירה — כל
        שינוי. אפשר להוסיף עוד טריגרים עם הכפתור + טריגר.
      </p>
    </div>
  );
}
