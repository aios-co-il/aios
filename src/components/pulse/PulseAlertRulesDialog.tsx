import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_PULSE_ALERT_RULES,
  parsePulseAlertRules,
  readCardLogSystemSends,
  type PulseAlertRules,
  type PulseManagerSettings,
} from "@/lib/pulseAlertRules";
import type { ManagerMode } from "../../../supabase/functions/_shared/manager-round/modes.ts";
import { resolveManagerSettings } from "../../../supabase/functions/_shared/manager-round/settings.ts";
import { CardLogSystemSendsSwitch } from "./CardLogSystemSendsSwitch";
import { ManagerModeSection } from "./manager-round/ManagerModeSection";

type PulseAlertRulesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: unknown;
  /**
   * Saves the alert rules and, for owners, the manager settings. The caller
   * merges both into the stored pulse_alert_rules (mergePulseAlertRules).
   */
  onSave: (
    rules: PulseAlertRules,
    manager: PulseManagerSettings,
  ) => Promise<void> | void;
  saving?: boolean;
  /** Tenant and agency owners see Carmen's manager settings (mode, card logging). */
  canManageManager?: boolean;
};

export function PulseAlertRulesDialog({
  open,
  onOpenChange,
  value,
  onSave,
  saving = false,
  canManageManager = false,
}: PulseAlertRulesDialogProps) {
  const [rules, setRules] = useState<PulseAlertRules>(
    DEFAULT_PULSE_ALERT_RULES,
  );
  const [managerMode, setManagerMode] = useState<ManagerMode>("observe");
  const [cardLogSystemSends, setCardLogSystemSends] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRules(parsePulseAlertRules(value));
    setManagerMode(resolveManagerSettings(value).mode);
    setCardLogSystemSends(readCardLogSystemSends(value));
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>חוקי התראות דופק ב-WhatsApp</DialogTitle>
          <DialogDescription>
            התראות מיידיות נשלחות לבעל הארגון ולקמפיינרים משויכים. סיכום דופק
            שבועי + בדיקת תקינות — יום ראשון 07:30 (שעון ישראל). רענון נתוני
            הדשבורד מתבצע פעמיים ביום (07:00 ו-16:00) בלי WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label className="text-sm">התראות מיידיות ב-WhatsApp</Label>
              <p className="text-xs text-muted-foreground">
                מפעיל/מכבה את כל סוגי ההתראות למטה
              </p>
            </div>
            <Switch
              checked={rules.instant_wa_enabled !== false}
              onCheckedChange={(checked) =>
                setRules((prev) => ({ ...prev, instant_wa_enabled: checked }))
              }
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">אין שיחה/פגישה</Label>
                <p className="text-xs text-muted-foreground">
                  התראה כשלא תועד קשר עם הלקוח
                </p>
              </div>
              <Switch
                checked={rules.no_contact_enabled !== false}
                onCheckedChange={(checked) =>
                  setRules((prev) => ({ ...prev, no_contact_enabled: checked }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">ימים ללא עדכון קשר</Label>
              <Input
                type="number"
                min={1}
                className="h-8 mt-1"
                value={rules.no_contact_days ?? 14}
                onChange={(event) =>
                  setRules((prev) => ({
                    ...prev,
                    no_contact_days: Number(event.target.value) || 14,
                  }))
                }
              />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">עליית CPL</Label>
                <p className="text-xs text-muted-foreground">
                  השוואה לשבוע הקודם
                </p>
              </div>
              <Switch
                checked={rules.cpl_spike_enabled !== false}
                onCheckedChange={(checked) =>
                  setRules((prev) => ({ ...prev, cpl_spike_enabled: checked }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">אחוז עלייה מינימלי</Label>
              <Input
                type="number"
                min={1}
                className="h-8 mt-1"
                value={rules.cpl_spike_pct ?? 50}
                onChange={(event) =>
                  setRules((prev) => ({
                    ...prev,
                    cpl_spike_pct: Number(event.target.value) || 50,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label className="text-sm">ניתוק / חשבון לא פעיל</Label>
              <p className="text-xs text-muted-foreground">
                דוח מנותק, סנכרון ישן, קמפיין שנעצר או מודעה חסומה
              </p>
            </div>
            <Switch
              checked={rules.disconnected_enabled !== false}
              onCheckedChange={(checked) =>
                setRules((prev) => ({ ...prev, disconnected_enabled: checked }))
              }
            />
          </div>

          {canManageManager && (
            <>
              <ManagerModeSection
                mode={managerMode}
                onChange={setManagerMode}
              />
              <CardLogSystemSendsSwitch
                checked={cardLogSystemSends}
                onCheckedChange={setCardLogSystemSends}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              onSave(
                parsePulseAlertRules(rules),
                canManageManager
                  ? {
                      mode: managerMode,
                      card_log_system_sends: cardLogSystemSends,
                    }
                  : {},
              )
            }
          >
            שמור חוקים
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
