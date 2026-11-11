import { StatusChip } from "@/components/report-ui/StatusChip";
import { cn } from "@/lib/utils";
import {
  CLIENT_MOOD_META,
  CLIENT_STATUS_META,
  clientMoodOf,
  clientServiceLabel,
  clientStatusOf,
} from "./clientStatusMeta";

/** The client's lifecycle status as a brand status chip. */
export function ClientStatusChip({ status }: { status: string | null }) {
  const meta = CLIENT_STATUS_META[clientStatusOf(status)];
  return <StatusChip tone={meta.tone}>{meta.label}</StatusChip>;
}

/** The client's mood as an icon chip; `compact` shows only the icon. */
export function ClientMoodChip({
  mood,
  compact = false,
  short = false,
}: {
  mood: string | null;
  compact?: boolean;
  short?: boolean;
}) {
  const meta = CLIENT_MOOD_META[clientMoodOf(mood)];
  const Icon = meta.icon;
  const label = short ? meta.shortLabel : meta.label;
  if (compact) {
    return (
      <Icon
        className={cn("h-4 w-4 shrink-0", meta.textClass)}
        aria-label={label}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.surfaceClass,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/** The client's product tags as quiet outline chips. */
export function ClientServiceChips({ services }: { services: unknown }) {
  const tags = Array.isArray(services)
    ? services.filter((s): s is string => typeof s === "string")
    : [];
  if (tags.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          dir="ltr"
          className="rounded-md border bg-surface-inset px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {clientServiceLabel(tag)}
        </span>
      ))}
    </div>
  );
}

/** The campaigners on a client's team as soft accent pills. */
export function ClientTeamPills({
  team,
}: {
  team: ReadonlyArray<{
    campaigner_id: string;
    campaigners: { full_name: string } | null;
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {team.map((member) => (
        <span
          key={member.campaigner_id}
          className="rounded-full bg-brand-accent-50 px-2 py-0.5 text-xs font-medium text-brand-accent-800 dark:bg-brand-accent-900/40 dark:text-brand-accent-200"
        >
          {member.campaigners?.full_name ?? "—"}
        </span>
      ))}
    </div>
  );
}
