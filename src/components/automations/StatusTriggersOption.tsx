import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type StatusTriggersOptionProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** Lets a "change status" step on a lead start the automations waiting for the new status. */
export function StatusTriggersOption({
  checked,
  onChange,
}: StatusTriggersOptionProps) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="fire-status-triggers"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <div className="space-y-1">
        <Label htmlFor="fire-status-triggers" className="text-right block">
          להפעיל אוטומציות של החלפת סטטוס
        </Label>
        <p className="text-xs text-muted-foreground">
          אחרי שהשלב משנה את הסטטוס של הליד, יופעלו האוטומציות שהטריגר שלהן הוא
          הסטטוס החדש, כמו בהחלפה ידנית.
        </p>
      </div>
    </div>
  );
}
