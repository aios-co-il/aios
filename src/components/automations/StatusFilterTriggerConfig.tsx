import { Label } from "@/components/ui/label";
import {
  decodeStatusSelection,
  triggerScope,
} from "../../../supabase/functions/_shared/automation-status.ts";
import { StatusStageSelect } from "./StatusStageSelect";

interface StatusFilterTriggerConfigProps {
  triggerType: string;
  tenantId: string;
  configuration: Record<string, any>;
  onConfigChange: (key: string, value: any) => void;
  onBulkConfigChange?: (updates: Record<string, any>) => void;
}

export default function StatusFilterTriggerConfig({
  triggerType,
  tenantId,
  configuration,
  onConfigChange,
  onBulkConfigChange,
}: StatusFilterTriggerConfigProps) {
  const scope = triggerScope(triggerType) || "lead";
  const stored =
    configuration?.filter_status_kind &&
    configuration?.filter_status &&
    configuration.filter_status !== "any"
      ? `${configuration.filter_status_kind}:${configuration.filter_status}`
      : configuration?.filter_status || "any";

  const write = (updates: Record<string, any>) => {
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
        סינון לפי סטטוס או שלב
      </Label>
      <StatusStageSelect
        tenantId={tenantId}
        scope={scope}
        value={stored}
        includeAny
        anyLabel="כל שינוי"
        placeholder="כל שינוי"
        onChange={(encoded) => {
          if (encoded === "any") {
            write({ filter_status: "any", filter_status_kind: null });
            return;
          }
          const { kind, value } = decodeStatusSelection(encoded);
          write({ filter_status: value, filter_status_kind: kind });
        }}
      />
      <p className="text-xs text-muted-foreground text-right">
        האוטומציה תרוץ רק כשהערך משתנה לסטטוס או לשלב שנבחר. משם אפשר להעביר את
        הליד לשלב במשפך או לשלוח לו הסכם.
      </p>
    </div>
  );
}
