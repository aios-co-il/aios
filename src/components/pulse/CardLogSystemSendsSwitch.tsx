import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type CardLogSystemSendsSwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** The owner switch that logs what AIOS sends to a client on the client card. */
export function CardLogSystemSendsSwitch({
  checked,
  onCheckedChange,
}: CardLogSystemSendsSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <Label className="text-sm" htmlFor="card-log-system-sends">
          תיעוד אוטומטי בכרטיס הלקוח של הודעות שנשלחו מהמערכת
        </Label>
        <p className="text-xs text-muted-foreground">
          דוחות, דשבורדים, סיכומי פגישות, דיוורים והודעות של כרמן ואוטומציות
          נרשמים בכרטיס הלקוח. הודעות שנשלחו מהצ׳אט נרשמות כסיכום יומי, בלי תוכן
          ההודעות. רישומים אלה לא נחשבים כשיחה עם הלקוח.
        </p>
      </div>
      <Switch
        id="card-log-system-sends"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
