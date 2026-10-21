import DOMPurify from "dompurify";
import {
  useMessageTemplates,
  type MessageTemplate,
  type TemplateChannel,
} from "@/hooks/useMessageTemplates";
import type { EmailAttachment } from "../../../supabase/functions/_shared/email-attachments.ts";
import { errorMessage } from "./templateUtils";
import { toast } from "sonner";

export interface TemplateDraft {
  name: string;
  subject: string;
  bodyHtml: string;
  htmlMode: boolean;
  bodyText: string;
  mediaUrl: string;
  attachments: EmailAttachment[];
}

/** Validate and save the editor's draft; closes the dialog on success. */
export function useSaveTemplate(
  template: MessageTemplate | null,
  channel: TemplateChannel,
  onClose: () => void,
) {
  const { save } = useMessageTemplates();

  const handleSave = async (d: TemplateDraft) => {
    if (!d.name.trim()) return toast.error("צריך שם לטמפלייט");
    if (channel === "email" && !d.subject.trim())
      return toast.error("צריך נושא למייל");
    if (channel === "whatsapp" && !d.bodyText.trim())
      return toast.error("צריך תוכן להודעה");
    try {
      await save.mutateAsync({
        id: template?.id,
        name: d.name.trim(),
        channel,
        subject: channel === "email" ? d.subject.trim() : null,
        body_html:
          channel !== "email"
            ? null
            : d.htmlMode
              ? d.bodyHtml
              : DOMPurify.sanitize(d.bodyHtml),
        html_mode: channel === "email" && d.htmlMode,
        attachments: channel === "email" ? d.attachments : [],
        body_text: channel === "whatsapp" ? d.bodyText : null,
        media_url: channel === "whatsapp" ? d.mediaUrl || null : null,
      });
      toast.success("הטמפלייט נשמר");
      onClose();
    } catch (e) {
      toast.error("שמירה נכשלה: " + errorMessage(e));
    }
  };

  return { handleSave, saving: save.isPending };
}
