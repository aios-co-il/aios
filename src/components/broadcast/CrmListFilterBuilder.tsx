import { useLeadStatuses } from "@/hooks/useLeadStatuses";
import { useLeadPipelineStages } from "@/hooks/useLeadPipelineStages";
import { useAssignableCampaigners } from "@/hooks/useAssignableCampaigners";
import type { AudienceFilter } from "@/hooks/useBroadcasts";
import { BroadcastAudienceMultiSelect } from "@/components/broadcast/BroadcastAudienceMultiSelect";
import {
  useChatTags,
  useNamedRows,
} from "@/components/broadcast/useCrmFilterOptions";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const CLIENT_STATUSES = [
  { value: "active", label: "פעיל" },
  { value: "onboarding", label: "בקליטה" },
  { value: "paused", label: "מושהה" },
  { value: "ended", label: "הסתיים" },
  { value: "inactive", label: "לא פעיל" },
];

export type CrmListFilter = AudienceFilter & { source: "leads" | "clients" };

/** Filter for CRM-based mailing lists: leads by stage/status, clients by status, both by agency. */
export function CrmListFilterBuilder({
  value,
  onChange,
}: {
  value: CrmListFilter;
  onChange: (f: CrmListFilter) => void;
}) {
  const { stages } = useLeadPipelineStages();
  const { statuses } = useLeadStatuses();
  // Each tenant manages its own stages and statuses in the CRM; filters store
  // the stable key and show the current label. A disabled one that is already
  // selected stays visible so it can be removed.
  const stageOptions = (stages || [])
    .filter((s) => s.is_active || value.stageKeys?.includes(s.stage_key))
    .map((s) => ({
      value: s.stage_key,
      label: `${s.label || s.stage_key}${s.is_active ? "" : " (לא פעיל)"}`,
    }));
  const statusOptions = (statuses || [])
    .filter((s) => s.is_active || value.statusKeys?.includes(s.status_key))
    .map((s) => ({
      value: s.status_key,
      label: `${s.label || s.status_key}${s.is_active ? "" : " (לא פעיל)"}`,
    }));
  const agencies = useNamedRows("agencies");
  const salesPeople = useNamedRows("sales_people");
  const tags = useChatTags();
  const campaigners = useAssignableCampaigners({
    enabled: value.source === "clients",
  });
  const set = (patch: Partial<CrmListFilter>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>מי נכנס לרשימה</Label>
        <div className="flex gap-2">
          {(["leads", "clients"] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={value.source === s ? "default" : "outline"}
              onClick={() => onChange({ source: s })}
            >
              {s === "leads" ? "לידים" : "לקוחות"}
            </Button>
          ))}
        </div>
      </div>

      {value.source === "leads" ? (
        <>
          <BroadcastAudienceMultiSelect
            label="שלב במשפך"
            options={stageOptions}
            selected={value.stageKeys || []}
            onSelectedChange={(stageKeys) => set({ stageKeys })}
            mode={value.stageMode || "include"}
            onModeChange={(stageMode) => set({ stageMode })}
            emptyLabel="כל השלבים"
          />
          <BroadcastAudienceMultiSelect
            label="סטטוס ליד"
            options={statusOptions}
            selected={value.statusKeys || []}
            onSelectedChange={(statusKeys) => set({ statusKeys })}
            mode={value.statusMode || "include"}
            onModeChange={(statusMode) => set({ statusMode })}
            emptyLabel="כל הסטטוסים"
          />
          <BroadcastAudienceMultiSelect
            label="איש מכירות"
            options={salesPeople.data || []}
            selected={value.salesPersonIds || []}
            onSelectedChange={(salesPersonIds) => set({ salesPersonIds })}
            emptyLabel="כולם"
          />
        </>
      ) : (
        <>
          <BroadcastAudienceMultiSelect
            label="סטטוס לקוח"
            options={CLIENT_STATUSES}
            selected={value.statuses || []}
            onSelectedChange={(statuses) => set({ statuses })}
            mode={value.statusMode || "include"}
            onModeChange={(statusMode) => set({ statusMode })}
            emptyLabel="כל הסטטוסים"
          />
          <BroadcastAudienceMultiSelect
            label="קמפיינר"
            options={(campaigners.data || []).map((c) => ({
              value: c.id,
              label: c.full_name || "—",
            }))}
            selected={value.campaignerIds || []}
            onSelectedChange={(campaignerIds) => set({ campaignerIds })}
            emptyLabel="כל הקמפיינרים"
          />
        </>
      )}

      <BroadcastAudienceMultiSelect
        label="סוכנות"
        options={agencies.data || []}
        selected={value.agencyIds || []}
        onSelectedChange={(agencyIds) => set({ agencyIds })}
        emptyLabel="כל הסוכנויות"
      />

      <BroadcastAudienceMultiSelect
        label="תגיות"
        options={tags.data || []}
        selected={value.tagIds || []}
        onSelectedChange={(tagIds) => set({ tagIds })}
        mode={value.tagMode || "include"}
        onModeChange={(tagMode) => set({ tagMode })}
        emptyLabel="כל התגיות"
      />
    </div>
  );
}
