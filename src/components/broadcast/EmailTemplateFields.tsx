import type { Dispatch, RefObject, SetStateAction } from "react";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import type { EmailAttachment } from "../../../supabase/functions/_shared/email-attachments.ts";
import { EmailBodyField } from "./EmailBodyField";
import { TemplateAttachments } from "./TemplateAttachments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Email template: subject, body (rich or HTML) and attachments. */
export function EmailTemplateFields({
  tenantId,
  subject,
  setSubject,
  subjectRef,
  bodyHtml,
  setBodyHtml,
  htmlMode,
  setHtmlMode,
  htmlRef,
  editorRef,
  attachments,
  setAttachments,
  onFocusChange,
}: {
  tenantId: string | null | undefined;
  subject: string;
  setSubject: (subject: string) => void;
  subjectRef: RefObject<HTMLInputElement>;
  bodyHtml: string;
  setBodyHtml: (html: string) => void;
  htmlMode: boolean;
  setHtmlMode: (html: boolean) => void;
  htmlRef: RefObject<HTMLTextAreaElement>;
  editorRef: RefObject<EmailRichEditorHandle>;
  attachments: EmailAttachment[];
  setAttachments: Dispatch<SetStateAction<EmailAttachment[]>>;
  onFocusChange: (focus: "subject" | "body") => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>נושא</Label>
        <Input
          ref={subjectRef}
          value={subject}
          onFocus={() => onFocusChange("subject")}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="היי {{first_name}}, יש לנו עדכון בשבילך"
        />
      </div>
      <EmailBodyField
        bodyHtml={bodyHtml}
        setBodyHtml={setBodyHtml}
        htmlMode={htmlMode}
        setHtmlMode={setHtmlMode}
        htmlRef={htmlRef}
        editorRef={editorRef}
        onFocus={() => onFocusChange("body")}
      />
      <TemplateAttachments
        tenantId={tenantId}
        attachments={attachments}
        setAttachments={setAttachments}
      />
    </>
  );
}
