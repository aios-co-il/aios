import DOMPurify from "dompurify";
import {
  useMessageTemplates,
  type MessageTemplate,
  type TemplateChannel,
} from "@/hooks/useMessageTemplates";
import { templateContent } from "../../../supabase/functions/_shared/broadcast/template/template-content.ts";
import type { TemplateDraft } from "./templateDraft";
import { errorMessage } from "./templateUtils";
import { toast } from "sonner";

/** Validate and save the editor's draft; closes the dialog on success. */
export function useSaveTemplate(
  template: MessageTemplate | null,
  channel: TemplateChannel,
  onClose: () => void,
) {
  const { save } = useMessageTemplates();

  const handleSave = (d: TemplateDraft) => {
    if (!d.name.trim()) return toast.error("צריך שם לטמפלייט");
    if (channel === "email" && !d.subject.trim())
      return toast.error("צריך נושא למייל");
    if (channel === "whatsapp" && !d.bodyText.trim())
      return toast.error("צריך תוכן להודעה");
    // Only the channel's own content is stored; the other columns are cleared.
    const content = templateContent({
      channel,
      subject: d.subject.trim(),
      body_text: d.bodyText,
      body_html: d.htmlMode ? d.bodyHtml : DOMPurify.sanitize(d.bodyHtml),
      html_mode: d.htmlMode,
      attachments: d.attachments,
      media_url: d.mediaUrl || null,
    });
    const columns =
      content.channel === "email"
        ? {
            subject: content.subject,
            body_html: content.bodyHtml,
            html_mode: content.htmlMode,
            attachments: content.attachments,
            body_text: null,
            media_url: null,
          }
        : {
            subject: null,
            body_html: null,
            html_mode: false,
            attachments: [],
            body_text: content.bodyText,
            media_url: content.mediaUrl,
          };
    save.mutate(
      { id: template?.id, name: d.name.trim(), channel, ...columns },
      {
        onSuccess: () => {
          toast.success("הטמפלייט נשמר");
          onClose();
        },
        onError: (e) => toast.error("שמירה נכשלה: " + errorMessage(e)),
      },
    );
  };

  return { handleSave, saving: save.isPending };
}
