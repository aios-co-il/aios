import { useState } from "react";
import type { TestSendPayload } from "@/components/broadcast/TemplateEditorFooter";
import { useSendTestEmail } from "@/components/broadcast/useSendTestEmail";
import { parseManualContacts } from "./wizardHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";

/** Send the wizard's current email as a test to typed addresses. */
export function WizardTestSend({
  getPayload,
  disabled,
}: {
  getPayload: () => Omit<TestSendPayload, "to">;
  disabled: boolean;
}) {
  const [to, setTo] = useState("");
  const sendTest = useSendTestEmail();
  const recipients = parseManualContacts(to);

  return (
    <div className="space-y-1 rounded-lg border p-3">
      <Label className="text-xs">שליחת בדיקה</Label>
      <div className="flex gap-2">
        <Input
          dir="ltr"
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="name@example.com"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || recipients.length === 0 || sendTest.isPending}
          onClick={() => sendTest.mutate({ ...getPayload(), to: recipients })}
        >
          {sendTest.isPending ? (
            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="ml-1 h-4 w-4" />
          )}
          שלח בדיקה
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        עד 5 כתובות, מופרדות בפסיק. הנושא יסומן [בדיקה] והשדות הדינמיים יישארו ריקים.
      </p>
    </div>
  );
}
