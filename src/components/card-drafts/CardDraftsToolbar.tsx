import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type CardDraftsToolbarProps = {
  selectedCount: number;
  allSelected: boolean;
  busy: boolean;
  onToggleAll: () => void;
  onApprove: () => void;
  onDismiss: () => void;
};

/** Select all, and approve or dismiss what is checked; sticks to the bottom on a phone. */
export function CardDraftsToolbar({
  selectedCount,
  allSelected,
  busy,
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
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onApprove} disabled={idle}>
          אשר נבחרים ({selectedCount})
        </Button>
        <Button variant="outline" onClick={onDismiss} disabled={idle}>
          דחה נבחרים ({selectedCount})
        </Button>
      </div>
    </div>
  );
}
