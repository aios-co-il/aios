import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PulseAlertRules } from "@/lib/pulseAlertRules";

/** The pulse rules that are only an on/off switch in the rules dialog. */
type PulseRuleSwitchKey =
  "disconnected_enabled" | "report_off_spending_enabled";

/** One pulse alert rule's on/off switch; a rule is on unless saved as false. */
export function PulseRuleSwitch({
  rule,
  label,
  description,
  rules,
  onChange,
}: {
  rule: PulseRuleSwitchKey;
  label: string;
  description: string;
  rules: PulseAlertRules;
  onChange: (update: (prev: PulseAlertRules) => PulseAlertRules) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <Label className="text-sm" htmlFor={`pulse-rule-${rule}`}>
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={`pulse-rule-${rule}`}
        checked={rules[rule] !== false}
        onCheckedChange={(checked) =>
          onChange((prev) => ({ ...prev, [rule]: checked }))
        }
      />
    </div>
  );
}
