import type { EmailAttachment } from "../../../supabase/functions/_shared/broadcast/template/email-attachments.ts";
import type { TemplateVars } from "../../../supabase/functions/_shared/broadcast/template/template-vars.ts";
import { useSendTestEmail } from "./useSendTestEmail";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Send } from "lucide-react";

/** Test email to the current user, for email templates. */
export interface TestSendPayload {
  tenantId: string | null | undefined;
  subject: string;
  bodyHtml: string;
  htmlMode: boolean;
  vars: TemplateVars;
  attachments: EmailAttachment[];
}

/** "Send test" (email only) and "Save" buttons of the template editor. */
export function TemplateEditorFooter({
  getTestPayload,
  onSave,
  saving,
}: {
  /** Builds the test-send body on click; null for channels without one. */
  getTestPayload: (() => TestSendPayload) | null;
  onSave: () => void;
  saving: boolean;
}) {
  const sendTest = useSendTestEmail();
  const testing = sendTest.isPending;

  return (
    <DialogFooter className="gap-2">
      {getTestPayload && (
        <Button
          variant="outline"
          onClick={() => sendTest.mutate(getTestPayload())}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="ml-1 h-4 w-4" />
          )}
          שלח בדיקה אליי
        </Button>
      )}
      <Button onClick={onSave} disabled={saving}>
        {saving ? (
          <Loader2 className="ml-1 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="ml-1 h-4 w-4" />
        )}
        שמור טמפלייט
      </Button>
    </DialogFooter>
  );
}
