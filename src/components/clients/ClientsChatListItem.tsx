import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "./ClientAvatar";
import { ClientMoodChip, ClientStatusChip } from "./ClientChips";

interface ClientsChatListItemProps {
  displayName: string;
  status: string | null;
  mood: string | null;
  agencyName: string | null | undefined;
  selected: boolean;
  multiSelectMode: boolean;
  checked: boolean;
  onClick: () => void;
  onCheckedChange: () => void;
}

/**
 * One client in the chat view's list: avatar with status dot, name and mood
 * icon, then agency and status chip. The open client gets an accent bar.
 */
export function ClientsChatListItem({
  displayName,
  status,
  mood,
  agencyName,
  selected,
  multiSelectMode,
  checked,
  onClick,
  onCheckedChange,
}: ClientsChatListItemProps) {
  const highlighted = multiSelectMode ? checked : selected;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected && !multiSelectMode ? "true" : undefined}
      className={cn(
        "relative w-full cursor-pointer rounded-xl px-3 py-2.5 text-right transition-colors",
        highlighted
          ? "bg-brand-accent-50 dark:bg-brand-accent-950/50"
          : "hover:bg-surface-inset",
      )}
    >
      {selected && !multiSelectMode && (
        <span
          className="absolute inset-y-2 start-0 w-1 rounded-full bg-brand-accent"
          aria-hidden="true"
        />
      )}
      <div className="flex items-center gap-3">
        {multiSelectMode && (
          <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
          </span>
        )}
        <ClientAvatar name={displayName} status={status} size="sm" />
        <div className="min-w-0 flex-1 text-right">
          <div className="flex items-center gap-1.5">
            <span
              dir="rtl"
              className="block min-w-0 flex-1 truncate text-right text-sm font-semibold"
            >
              {displayName}
            </span>
            <ClientMoodChip mood={mood} compact short />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <ClientStatusChip status={status} />
            {agencyName && (
              <span className="truncate text-xs text-muted-foreground">
                {agencyName}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
