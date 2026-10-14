import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export function StatusStageMultiSelect({
  tenantId,
  scopes,
  value,
  onChange,
}: {
  tenantId?: string | null;
  scopes: StatusStageScope[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const loadLeadCatalog = scopes.includes("lead") && !!tenantId;
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
    const collected: { label: string; options: CatalogOption[] }[] = [];
    const seen = new Set<string>();
    for (const scope of scopes) {
      const scopeGroups =
        scope === "task"
          ? [
              {
                label: "סטטוס משימה",
                options: TASK_STATUS_OPTIONS.map((option) => ({
                  kind: "task_status" as const,
                  value: option.value,
                  label: option.label,
                })),
              },
            ]
          : scope === "client"
            ? [
                {
                  label: "סטטוס לקוח",
                  options: CLIENT_STATUS_OPTIONS.map((option) => ({
                    kind: "client_status" as const,
                    value: option.value,
                    label: option.label,
                  })),
                },
              ]
            : scope === "onboarding"
              ? [
                  {
                    label: "סטטוס קליטה",
                    options: ONBOARDING_STATUS_OPTIONS.map((option) => ({
                      kind: "onboarding_status" as const,
                      value: option.value,
                      label: option.label,
                    })),
                  },
                ]
              : [
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
      for (const group of scopeGroups) {
        if (seen.has(group.label)) continue;
        seen.add(group.label);
        collected.push(group);
      }
    }
    return collected;
  }, [scopes, leadStatuses, pipelineStages]);

  const options = groups.flatMap((group) => group.options);
  const selectedLabels = options
    .filter((option) => isOptionSelected(value, option, options))
    .map((option) => option.label);
  const summary =
    selectedLabels.length === 0
      ? "כל שינוי"
      : selectedLabels.length <= 2
        ? selectedLabels.join(" / ")
        : `${selectedLabels.length} נבחרו`;
  const loading = loadLeadCatalog && (loadingStatuses || loadingStages);

  const toggle = (option: CatalogOption) => {
    const encoded = encodeStatusSelection(option.kind, option.value);
    const checked = isOptionSelected(value, option, options);
    if (checked) {
      onChange(
        value.filter(
          (item) =>
            item !== encoded &&
            resolveStoredStatusSelection(item, options) !== encoded,
        ),
      );
      return;
    }
    onChange([...value.filter((item) => item !== "any"), encoded]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between text-right font-normal"
        >
          <span className="truncate">{loading ? "טוען..." : summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div
          className="max-h-72 space-y-3 overflow-y-auto text-right"
          dir="rtl"
        >
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => onChange([])}
          >
            כל שינוי
          </button>
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="text-xs font-semibold">{group.label}</p>
              {group.options.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין ערכים</p>
              ) : (
                group.options.map((option) => {
                  const encoded = encodeStatusSelection(
                    option.kind,
                    option.value,
                  );
                  const checked = isOptionSelected(value, option, options);
                  return (
                    <label
                      key={encoded}
                      className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(option)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isOptionSelected(
  selected: string[],
  option: CatalogOption,
  options: CatalogOption[],
): boolean {
  const encoded = encodeStatusSelection(option.kind, option.value);
  if (selected.includes(encoded)) return true;
  return selected.some(
    (item) => resolveStoredStatusSelection(item, options) === encoded,
  );
}
