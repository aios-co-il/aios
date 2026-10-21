import { useRef, useState } from "react";
import DOMPurify from "dompurify";
import type {
  MessageTemplate,
  TemplateChannel,
} from "@/hooks/useMessageTemplates";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import {
  toEmailAttachments,
  type EmailAttachment,
} from "../../../supabase/functions/_shared/email-attachments.ts";
import { EmailTemplateFields } from "./EmailTemplateFields";
import { TemplateEditorFooter } from "./TemplateEditorFooter";
import { TemplateEditorToolbar } from "./TemplateEditorToolbar";
import { TemplatePreview } from "./TemplatePreview";
import { UnknownFieldsWarning } from "./UnknownFieldsWarning";
import { WhatsAppTemplateFields } from "./WhatsAppTemplateFields";
import { insertAtCursor } from "./templateUtils";
import { useSaveTemplate } from "./useSaveTemplate";
import { useTemplateSample } from "./useTemplateSample";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TemplateEditorDialog({
  template,
  channel,
  onClose,
}: {
  template: MessageTemplate | null;
  channel: TemplateChannel;
  onClose: () => void;
}) {
  const { tenantId } = useCurrentTenant();
  const { handleSave, saving } = useSaveTemplate(template, channel, onClose);
  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [bodyHtml, setBodyHtml] = useState(template?.body_html || "");
  const [htmlMode, setHtmlMode] = useState(!!template?.html_mode);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const [bodyText, setBodyText] = useState(template?.body_text || "");
  const [mediaUrl, setMediaUrl] = useState(template?.media_url || "");
  const [attachments, setAttachments] = useState<EmailAttachment[]>(() =>
    toEmailAttachments(template?.attachments),
  );
  const [sampleListId, setSampleListId] = useState<string | undefined>();
  const editorRef = useRef<EmailRichEditorHandle>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<"subject" | "body">("body");
  const { staticLists, customKeys, previewVars, sampleLabel } =
    useTemplateSample(sampleListId);

  const insertField = (token: string) => {
    if (channel === "email" && focus === "subject")
      return insertAtCursor(subjectRef.current, subject, setSubject, token);
    if (channel === "email" && htmlMode)
      return insertAtCursor(htmlRef.current, bodyHtml, setBodyHtml, token);
    if (channel === "email") return editorRef.current?.insertText(token);
    insertAtCursor(textRef.current, bodyText, setBodyText, token);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[92vh] max-w-5xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>
            {template ? "עריכת טמפלייט" : "טמפלייט חדש"} ·{" "}
            {channel === "email" ? "מייל" : "וואטסאפ"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>שם הטמפלייט</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <TemplateEditorToolbar
              onPick={insertField}
              customKeys={customKeys}
              staticLists={staticLists}
              sampleListId={sampleListId}
              onSampleListChange={setSampleListId}
            />

            {channel === "email" ? (
              <EmailTemplateFields
                tenantId={tenantId}
                subject={subject}
                setSubject={setSubject}
                subjectRef={subjectRef}
                bodyHtml={bodyHtml}
                setBodyHtml={setBodyHtml}
                htmlMode={htmlMode}
                setHtmlMode={setHtmlMode}
                htmlRef={htmlRef}
                editorRef={editorRef}
                attachments={attachments}
                setAttachments={setAttachments}
                onFocusChange={setFocus}
              />
            ) : (
              <WhatsAppTemplateFields
                tenantId={tenantId}
                bodyText={bodyText}
                setBodyText={setBodyText}
                textRef={textRef}
                mediaUrl={mediaUrl}
                setMediaUrl={setMediaUrl}
              />
            )}

            <UnknownFieldsWarning
              text={`${subject} ${bodyHtml} ${bodyText}`}
              customKeys={customKeys}
            />
          </div>

          <TemplatePreview
            channel={channel}
            sampleLabel={sampleLabel}
            subject={subject}
            bodyHtml={bodyHtml}
            bodyText={bodyText}
            htmlMode={htmlMode}
            mediaUrl={mediaUrl}
            attachments={attachments}
            previewVars={previewVars}
          />
        </div>

        <TemplateEditorFooter
          getTestPayload={
            channel === "email"
              ? () => ({
                  tenantId,
                  subject,
                  bodyHtml: htmlMode ? bodyHtml : DOMPurify.sanitize(bodyHtml),
                  htmlMode,
                  vars: previewVars,
                  attachments,
                })
              : null
          }
          onSave={() =>
            handleSave({
              name,
              subject,
              bodyHtml,
              htmlMode,
              bodyText,
              mediaUrl,
              attachments,
            })
          }
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}
