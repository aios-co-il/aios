import { cn } from "@/lib/utils";

/**
 * A row's on/off state as the ad platform reports it, drawn as a switch. It
 * only shows the state: it follows each sync and does not change the
 * campaign on the platform. Null when the platform reports no state.
 */
export function CampaignStatusSwitch({
  on,
  compact = false,
}: {
  on: boolean | null;
  /** Only the switch, without the "פעיל"/"כבוי" word (the title still says it). */
  compact?: boolean;
}) {
  if (on === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const label = on ? "פעיל" : "כבוי";
  return (
    <span
      role="img"
      aria-label={label}
      title={`${label} — לפי הדיווח האחרון מהפלטפורמה`}
      className="inline-flex items-center gap-2"
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          on ? "bg-brand-accent" : "bg-brand-neutral/60",
        )}
      >
        <span
          className={cn(
            // Physical left, like the app's Switch: on moves the knob right.
            "absolute h-4 w-4 rounded-full bg-background shadow-elevation-1 transition-[left]",
            on ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      {!compact && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </span>
  );
}
