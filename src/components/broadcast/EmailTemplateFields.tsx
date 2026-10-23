import type { RefObject } from "react";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import { draftField, type TemplateDraftProps } from "./templateDraft";
import { EmailBodyField } from "./EmailBodyField";
import { TemplateAttachments } from "./TemplateAttachments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Email template: subject, body (rich or HTML) and attachments. */
export function EmailTemplateFields({
  tenantId,
  draft,
  setDraft,
  subjectRef,
  htmlRef,
  editorRef,
  onFocusChange,
}: TemplateDraftProps & {
  tenantId: string | null | undefined;
  subjectRef: RefObject<HTMLInputElement>;
  htmlRef: RefObject<HTMLTextAreaElement>;
  editorRef: RefObject<EmailRichEditorHandle>;
  onFocusChange: (focus: "subject" | "body") => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>נושא</Label>
        <Input
          ref={subjectRef}
          value={draft.subject}
          onFocus={() => onFocusChange("subject")}
          onChange={(e) => draftField(setDraft, "subject")(e.target.value)}
          placeholder="היי {{first_name}}, יש לנו עדכון בשבילך"
        />
      </div>
      <EmailBodyField
        bodyHtml={draft.bodyHtml}
        setBodyHtml={draftField(setDraft, "bodyHtml")}
        htmlMode={draft.htmlMode}
        setHtmlMode={draftField(setDraft, "htmlMode")}
        htmlRef={htmlRef}
        editorRef={editorRef}
        onFocus={() => onFocusChange("body")}
      />
      <TemplateAttachments
        tenantId={tenantId}
        attachments={draft.attachments}
        setAttachments={draftField(setDraft, "attachments")}
      />
    </>
  );
}
