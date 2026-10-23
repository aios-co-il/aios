import { useRef, useState } from "react";
import DOMPurify from "dompurify";
import type {
  MessageTemplate,
  TemplateChannel,
} from "@/hooks/useMessageTemplates";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import { EmailTemplateFields } from "./EmailTemplateFields";
import { TemplateEditorFooter } from "./TemplateEditorFooter";
import { TemplateEditorToolbar } from "./TemplateEditorToolbar";
import { TemplatePreview } from "./TemplatePreview";
import { UnknownFieldsWarning } from "./UnknownFieldsWarning";
import { WhatsAppTemplateFields } from "./WhatsAppTemplateFields";
import { draftField, draftFrom, type TemplateDraft } from "./templateDraft";
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
  const [draft, setDraft] = useState<TemplateDraft>(() => draftFrom(template));
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const [sampleListId, setSampleListId] = useState<string | undefined>();
  const editorRef = useRef<EmailRichEditorHandle>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<"subject" | "body">("body");
  const { sampleLists, customKeys, previewVars, sampleLabel } =
    useTemplateSample(sampleListId);

  const { subject, bodyHtml, htmlMode, bodyText, attachments } = draft;
  const insertField = (token: string) => {
    const set = (key: "subject" | "bodyHtml" | "bodyText") =>
      draftField(setDraft, key);
    if (channel === "email" && focus === "subject")
      return insertAtCursor(subjectRef.current, subject, set("subject"), token);
    if (channel === "email" && htmlMode)
      return insertAtCursor(htmlRef.current, bodyHtml, set("bodyHtml"), token);
    if (channel === "email") return editorRef.current?.insertText(token);
    insertAtCursor(textRef.current, bodyText, set("bodyText"), token);
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
              <Input
                value={draft.name}
                onChange={(e) => draftField(setDraft, "name")(e.target.value)}
              />
            </div>

            <TemplateEditorToolbar
              onPick={insertField}
              customKeys={customKeys}
              sampleLists={sampleLists}
              sampleListId={sampleListId}
              onSampleListChange={setSampleListId}
            />

            {channel === "email" ? (
              <EmailTemplateFields
                tenantId={tenantId}
                draft={draft}
                setDraft={setDraft}
                subjectRef={subjectRef}
                htmlRef={htmlRef}
                editorRef={editorRef}
                onFocusChange={setFocus}
              />
            ) : (
              <WhatsAppTemplateFields
                tenantId={tenantId}
                draft={draft}
                setDraft={setDraft}
                textRef={textRef}
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
            draft={draft}
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
          onSave={() => handleSave(draft)}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}
