import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SalesPerson {
  id: string;
  full_name: string;
}

interface BulkAssignSalesPeopleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadCount: number;
  salesPeople: ReadonlyArray<SalesPerson>;
  selectedIds: Array<string>;
  onSelectedIdsChange: (ids: Array<string>) => void;
  onAssign: () => void;
  isAssigning: boolean;
}

/** Picks one or more sales people to split the selected leads between. */
export function BulkAssignSalesPeopleDialog({
  open,
  onOpenChange,
  leadCount,
  salesPeople,
  selectedIds,
  onSelectedIdsChange,
  onAssign,
  isAssigning,
}: BulkAssignSalesPeopleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>שייך {leadCount} לידים לאנשי מכירות</DialogTitle>
          <DialogDescription>
            {selectedIds.length > 1 ? (
              <>
                הלידים יחולקו שווה בשווה בין {selectedIds.length} אנשי המכירות
                (כ-
                {Math.ceil(leadCount / selectedIds.length)} לידים לכל אחד)
              </>
            ) : (
              "בחר איש מכירות אחד או יותר לשיוך הלידים"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] space-y-1 overflow-y-auto py-4">
          {salesPeople.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              אין אנשי מכירות פעילים
            </p>
          ) : (
            salesPeople.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/60"
              >
                <Checkbox
                  id={`sp-${sp.id}`}
                  checked={selectedIds.includes(sp.id)}
                  onCheckedChange={(checked) =>
                    onSelectedIdsChange(
                      checked
                        ? [...selectedIds, sp.id]
                        : selectedIds.filter((id) => id !== sp.id),
                    )
                  }
                />
                <label
                  htmlFor={`sp-${sp.id}`}
                  className="flex-1 cursor-pointer"
                >
                  {sp.full_name}
                </label>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button
            onClick={onAssign}
            disabled={selectedIds.length === 0 || isAssigning}
          >
            {isAssigning ? "משייך..." : "שייך"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
