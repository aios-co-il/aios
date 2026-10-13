import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENT_STATUS_OPTIONS,
  ONBOARDING_STATUS_OPTIONS,
  TASK_STATUS_OPTIONS,
  encodeStatusSelection,
  resolveStoredStatusSelection,
  type AutomationStatusKind,
  type StatusStageScope,
} from "../../../supabase/functions/_shared/automation-status.ts";

type CatalogOption = {
  kind: AutomationStatusKind;
  value: string;
  label: string;
};

interface StatusStageSelectProps {
  tenantId?: string | null;
  scope: StatusStageScope;
  value?: string;
  onChange: (value: string) => void;
  includeAny?: boolean;
  anyLabel?: string;
  placeholder?: string;
  triggerClassName?: string;
}

export function StatusStageSelect({
  tenantId,
  scope,
  value,
  onChange,
  includeAny = false,
  anyLabel = "כל שינוי",
  placeholder = "בחר סטטוס או שלב",
  triggerClassName,
}: StatusStageSelectProps) {
  const loadLeadCatalog = scope === "lead" && !!tenantId;

  const { data: leadStatuses = [], isLoading: loadingStatuses } = useQuery({
    queryKey: ["automation-lead-statuses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_statuses")
        .select("status_key, label")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: loadLeadCatalog,
  });

  const { data: pipelineStages = [], isLoading: loadingStages } = useQuery({
    queryKey: ["automation-lead-pipeline-stages", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_pipeline_stages")
        .select("stage_key, label")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: loadLeadCatalog,
  });

  const groups = useMemo((): { label: string; options: CatalogOption[] }[] => {
    if (scope === "task") {
      return [
        {
          label: "סטטוס משימה",
          options: TASK_STATUS_OPTIONS.map((option) => ({
            kind: "task_status" as const,
            value: option.value,
            label: option.label,
          })),
        },
      ];
    }
    if (scope === "client") {
      return [
        {
          label: "סטטוס לקוח",
          options: CLIENT_STATUS_OPTIONS.map((option) => ({
            kind: "client_status" as const,
            value: option.value,
            label: option.label,
          })),
        },
      ];
    }
    if (scope === "onboarding") {
      return [
        {
          label: "סטטוס קליטה",
          options: ONBOARDING_STATUS_OPTIONS.map((option) => ({
            kind: "onboarding_status" as const,
            value: option.value,
            label: option.label,
          })),
        },
      ];
    }
    return [
      {
        label: "סטטוס תגובה",
        options: leadStatuses.map((status) => ({
          kind: "response_status" as const,
          value: status.status_key,
          label: status.label,
        })),
      },
      {
        label: "שלב במשפך",
        options: pipelineStages.map((stage) => ({
          kind: "pipeline_stage" as const,
          value: stage.stage_key,
          label: stage.label,
        })),
      },
    ];
  }, [scope, leadStatuses, pipelineStages]);

  const options = groups.flatMap((group) => group.options);
  const displayValue =
    !value || (includeAny && value === "any")
      ? includeAny
        ? "any"
        : undefined
      : resolveStoredStatusSelection(value, options);

  const loading = loadLeadCatalog && (loadingStatuses || loadingStages);

  return (
    <Select value={displayValue} onValueChange={onChange}>
      <SelectTrigger className={triggerClassName || "text-right"}>
        <SelectValue
          placeholder={loading ? "טוען סטטוסים ושלבים..." : placeholder}
        />
      </SelectTrigger>
      <SelectContent className="bg-background z-[100]">
        {includeAny && <SelectItem value="any">{anyLabel}</SelectItem>}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.length === 0 ? (
              <SelectItem value={`__empty_${group.label}`} disabled>
                אין ערכים
              </SelectItem>
            ) : (
              group.options.map((option: CatalogOption) => (
                <SelectItem
                  key={encodeStatusSelection(option.kind, option.value)}
                  value={encodeStatusSelection(option.kind, option.value)}
                >
                  {option.label}
                </SelectItem>
              ))
            )}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
