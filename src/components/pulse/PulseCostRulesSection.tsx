import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PulseAlertRules } from "@/lib/pulseAlertRules";
import {
  resolvePulseCostRules,
  type PulseCostRules,
} from "../../../supabase/functions/_shared/pulse/cost-rules.ts";

type PulseCostRulesSectionProps = {
  rules: PulseAlertRules;
  onChange: Dispatch<SetStateAction<PulseAlertRules>>;
};

/**
 * The thresholds for campaigns without a target (pulse_alert_rules.manager.cost,
 * the same rules the snapshot alerts on) and the switch that sends them on
 * WhatsApp.
 */
export function PulseCostRulesSection({
  rules,
  onChange,
}: PulseCostRulesSectionProps) {
  const cost = resolvePulseCostRules(rules);
  const setCost = (patch: Partial<PulseCostRules>) =>
    onChange((prev) => ({
      ...prev,
      manager: {
        ...(prev.manager ?? {}),
        cost: { ...(prev.manager?.cost ?? {}), ...patch },
      },
    }));

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm">עלייה בעלות בקמפיין בלי יעד</Label>
          <p className="text-xs text-muted-foreground">
            חריגה כשהעלות עולה (או ה־ROAS יורד) גם ב־3 וגם ב־7 הימים האחרונים
            מול 4 השבועות שלפניהם. מוצג בדשבורד תמיד; ב־WhatsApp רק כשהמתג פעיל.
          </p>
        </div>
        <Switch
          checked={cost.target_less_alerts}
          onCheckedChange={(checked) =>
            setCost({ target_less_alerts: checked })
          }
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ThresholdInput
          label="עליית CPL/CPA (%)"
          value={cost.trend_pct}
          min={1}
          onCommit={(trend_pct) => setCost({ trend_pct })}
        />
        <ThresholdInput
          label="ירידת ROAS (%)"
          value={cost.roas_drop_pct}
          min={1}
          onCommit={(roas_drop_pct) => setCost({ roas_drop_pct })}
        />
        <ThresholdInput
          label="הוצאה מינ׳ ב־7 ימים"
          value={cost.min_spend_7d}
          min={0}
          onCommit={(min_spend_7d) => setCost({ min_spend_7d })}
        />
      </div>
    </div>
  );
}

/**
 * A threshold that can be cleared while typing: the text is kept as typed, only a
 * valid number (at least `min`) is stored, and leaving the field restores the
 * stored value. Clearing it never stores 0, so the minimum-spend guard stays on.
 */
export function ThresholdInput({
  label,
  value,
  min,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        className="h-8 mt-1"
        aria-label={label}
        value={draft}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const number = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(number) && number >= min) {
            onCommit(number);
          }
        }}
        onBlur={() => setDraft(String(value))}
      />
    </div>
  );
}
