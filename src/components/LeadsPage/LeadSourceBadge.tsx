import {
  leadArrivalSourceChanged,
  leadFirstSourceDisplay,
  leadSourceDisplay,
} from "@/lib/leadFields";

interface SourceLead {
  source?: string | null;
  first_source?: string | null;
}

/**
 * Where the lead came from as a quiet badge; when the source changed since
 * the lead first arrived, the first source sits under it.
 */
export function LeadSourceBadge({ lead }: { lead: SourceLead }) {
  const current = leadSourceDisplay(lead);
  if (!current) {
    return <span className="text-muted-foreground">—</span>;
  }
  const changed = leadArrivalSourceChanged(lead);
  const first = changed ? leadFirstSourceDisplay(lead) : null;
  return (
    <div
      className="flex min-w-0 flex-col items-start gap-0.5"
      title={first ? `${current} (מעודכן) · ${first} (ראשוני)` : current}
    >
      <span className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
        {current}
      </span>
      {first && (
        <span className="max-w-full truncate text-[11px] text-muted-foreground">
          ראשוני: {first}
        </span>
      )}
    </div>
  );
}
