import { useState } from "react";
import { Settings2 } from "lucide-react";
import { PulseAlertRulesDialog } from "@/components/pulse/PulseAlertRulesDialog";
import { Button } from "@/components/ui/button";
import { mergePulseAlertRules } from "@/lib/pulseAlertRules";

type PulseAlertRulesButtonProps = {
  /** The stored pulse_alert_rules JSON. */
  stored: unknown;
  saving: boolean;
  /** Saves the pulse_alert_rules value; `onSuccess` runs only once the save succeeded. */
  save: (
    pulseAlertRules: Record<string, unknown>,
    onSuccess: () => void,
  ) => void;
};

/**
 * Opens the pulse alert rules dialog and saves what it edits merged into the
 * stored JSON, so keys the dialog does not edit are never dropped. The dialog
 * closes only after a successful save; a failure leaves it open.
 */
export function PulseAlertRulesButton({
  stored,
  saving,
  save,
}: PulseAlertRulesButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-4 w-4 ml-2" />
        ניהול חוקי התראות דופק
      </Button>
      <PulseAlertRulesDialog
        open={open}
        onOpenChange={setOpen}
        value={stored}
        saving={saving}
        onSave={(rules, manager) =>
          save(mergePulseAlertRules(stored, rules, manager), () =>
            setOpen(false),
          )
        }
      />
    </>
  );
}
