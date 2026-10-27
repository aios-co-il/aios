import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  MANAGER_MODES,
  type ManagerMode,
} from "../../../../supabase/functions/_shared/manager-round/modes.ts";
import { OpenFindingsList } from "./OpenFindingsList";

const MODE_TEXT: Record<ManagerMode, { label: string; hint: string }> = {
  off: { label: "כבוי", hint: "כרמן לא בודקת ולא שולחת דבר." },
  observe: {
    label: "צפייה",
    hint: "כרמן רושמת ממצאים ומה הייתה עושה איתם, ולא שולחת כלום.",
  },
  david_only: {
    label: "רק לבעלים",
    hint: "סיכום בוקר ב־08:00 ודחופים לבעלי הארגון בלבד, מהקו של כרמן.",
  },
  team: {
    label: "צוות מלא",
    hint: "התראות לקמפיינרים, ומה שלא טופל עובר למנהלים ולבעלים בשעות העבודה.",
  },
};

export type ManagerModeSectionProps = {
  mode: ManagerMode;
  onChange: (mode: ManagerMode) => void;
};

/** Owner-only rollout control of Carmen's manager round, with what it found so far. */
export function ManagerModeSection({
  mode,
  onChange,
}: ManagerModeSectionProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div>
        <Label className="text-sm">כרמן כמנהלת שיווק</Label>
        <p className="text-xs text-muted-foreground">
          שום דבר לא נשלח על מה שקרה לפני שהופעל מצב שליחה.
        </p>
      </div>
      <RadioGroup
        value={mode}
        onValueChange={(value) => {
          const picked = MANAGER_MODES.find((option) => option === value);
          if (picked) {
            onChange(picked);
          }
        }}
      >
        {MANAGER_MODES.map((option) => (
          <div key={option} className="flex items-start gap-2">
            <RadioGroupItem
              id={`manager-mode-${option}`}
              value={option}
              className="mt-0.5"
            />
            <Label htmlFor={`manager-mode-${option}`} className="font-normal">
              <span className="text-sm">{MODE_TEXT[option].label}</span>
              <span className="block text-xs text-muted-foreground">
                {MODE_TEXT[option].hint}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <OpenFindingsList />
    </div>
  );
}
