import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  EmailAttachment,
  TemplateVars,
} from "../../../supabase/functions/_shared/broadcast-template.ts";
import { errorMessage } from "./templateUtils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
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
  const [testing, setTesting] = useState(false);

  const sendTest = async (body: TestSendPayload) => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "broadcast-test-send",
        { body },
      );
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`נשלח מייל בדיקה אל ${data.to}`);
    } catch (e) {
      toast.error("שליחת בדיקה נכשלה: " + errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <DialogFooter className="gap-2">
      {getTestPayload && (
        <Button
          variant="outline"
          onClick={() => sendTest(getTestPayload())}
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
