import type { ComponentProps } from "react";
import type { LeadStatus } from "@/hooks/useLeadStatuses";
import {
  findLeadStatus,
  responseStatusSelectValue,
  unmatchedResponseStatusValue,
} from "@/lib/leadFields";
import { LeadColorSelect, type LeadColorOption } from "./LeadColorSelect";
import type { LeadStageOption } from "./leadTableTypes";

type MenuState = Pick<
  ComponentProps<typeof LeadColorSelect>,
  "open" | "onOpenChange"
>;

/** The funnel stage of a lead, changed inline from the table row. */
export function LeadStageCell({
  status,
  stages,
  onChange,
  onManage,
  ...menu
}: MenuState & {
  status: string | null | undefined;
  stages: ReadonlyArray<LeadStageOption>;
  onChange: (stageId: string) => void;
  onManage: () => void;
}) {
  const stage = stages.find((s) => s.id === status);
  return (
    <LeadColorSelect
      value={status ?? undefined}
      options={stages.map((s) => ({
        value: s.id,
        label: s.label,
        color: s.hexColor,
      }))}
      current={stage ? { label: stage.label, color: stage.hexColor } : null}
      placeholder="בחר שלב"
      onValueChange={onChange}
      manageLabel="ניהול שלבי משפך"
      onManage={onManage}
      {...menu}
    />
  );
}

/** The response status of a lead; "none" clears it. */
export function LeadResponseStatusCell({
  responseStatus,
  leadStatuses,
  isLoading,
  onChange,
  onManage,
  ...menu
}: MenuState & {
  responseStatus: string | null | undefined;
  leadStatuses: Array<LeadStatus>;
  isLoading: boolean;
  onChange: (statusKey: string | null) => void;
  onManage: () => void;
}) {
  const status = findLeadStatus(responseStatus, leadStatuses);
  const unmatched = unmatchedResponseStatusValue(responseStatus, leadStatuses);
  const label = status?.label || responseStatus || null;
  const options: Array<LeadColorOption> = [
    { value: "none", label: "ללא סטטוס" },
    ...(unmatched ? [{ value: unmatched, label: unmatched }] : []),
    ...leadStatuses.map((s) => ({
      value: s.status_key,
      label: s.label,
      color: s.color,
    })),
  ];
  return (
    <LeadColorSelect
      value={responseStatusSelectValue(responseStatus, leadStatuses)}
      options={options}
      current={label ? { label, color: status?.color } : null}
      placeholder={isLoading ? "טוען..." : "ללא סטטוס"}
      onValueChange={(value) => onChange(value === "none" ? null : value)}
      manageLabel="ניהול סטטוסים"
      onManage={onManage}
      {...menu}
    />
  );
}
