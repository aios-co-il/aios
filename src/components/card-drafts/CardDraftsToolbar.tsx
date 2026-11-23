import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type CardDraftsToolbarProps = {
  selectedCount: number;
  allSelected: boolean;
  busy: boolean;
  /** Only owners may dismiss (carmen_finding_set_status); others see no dismiss button. */
  canDismiss: boolean;
  onToggleAll: () => void;
  onApprove: () => void;
  onDismiss: () => void;
};

/** Select all, and approve or dismiss what is checked; sticks to the bottom on a phone. */
export function CardDraftsToolbar({
  selectedCount,
  allSelected,
  busy,
  canDismiss,
  onToggleAll,
  onApprove,
  onDismiss,
}: CardDraftsToolbarProps) {
  const idle = busy || selectedCount === 0;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:px-0">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onToggleAll}
          disabled={busy}
          aria-label="בחירת הכל"
          className="h-5 w-5"
        />
        בחירת הכל
      </label>
      <div className={canDismiss ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
        <Button onClick={onApprove} disabled={idle}>
          אשר נבחרים ({selectedCount})
        </Button>
        {canDismiss && (
          <Button variant="outline" onClick={onDismiss} disabled={idle}>
            דחה נבחרים ({selectedCount})
          </Button>
        )}
      </div>
    </div>
  );
}
