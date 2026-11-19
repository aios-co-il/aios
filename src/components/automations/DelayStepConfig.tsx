import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DELAY_UNITS } from "./delayUnits";

/** The settings of a delay step, as stored in the step's configuration. */
type DelayConfiguration = {
  delay_value?: number;
  delay_unit?: string;
  delay_require_same_status?: boolean;
};

type DelayStepConfigProps = {
  configuration: DelayConfiguration | undefined;
  onChange: (
    key: keyof DelayConfiguration,
    value: number | string | boolean,
  ) => void;
};

/** Delay step settings: how long to wait, and whether the lead must keep its status. */
export function DelayStepConfig({
  configuration,
  onChange,
}: DelayStepConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="delay-value" className="text-right block">
          זמן המתנה
        </Label>
        <Input
          id="delay-value"
          type="number"
          min={1}
          value={configuration?.delay_value || ""}
          onChange={(e) =>
            onChange("delay_value", parseInt(e.target.value) || 0)
          }
          placeholder="כמות"
          className="text-right"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-right block">יחידה</Label>
        <Select
          value={configuration?.delay_unit || "minutes"}
          onValueChange={(unit) => onChange("delay_unit", unit)}
        >
          <SelectTrigger className="text-right" aria-label="יחידה">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELAY_UNITS.map((unit) => (
              <SelectItem key={unit.value} value={unit.value}>
                {unit.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="delay-require-same-status"
          checked={configuration?.delay_require_same_status === true}
          onCheckedChange={(checked) =>
            onChange("delay_require_same_status", checked === true)
          }
        />
        <div className="space-y-1">
          <Label
            htmlFor="delay-require-same-status"
            className="text-right block"
          >
            להמשיך רק אם הליד עדיין באותו סטטוס
          </Label>
          <p className="text-xs text-muted-foreground">
            אם הסטטוס של הליד השתנה בזמן ההמתנה, השלבים הבאים לא ירוצו. מתאים
            לאוטומציה שמתחילה בהחלפת סטטוס של ליד.
          </p>
        </div>
      </div>
    </>
  );
}
