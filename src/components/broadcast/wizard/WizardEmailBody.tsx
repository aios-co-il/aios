import { useRef } from "react";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import { EmailBodyField } from "@/components/broadcast/EmailBodyField";
import { TemplateFieldPicker } from "@/components/broadcast/TemplateFieldPicker";
import { insertAtCursor } from "@/components/broadcast/templateUtils";

/** Email body without a template: rich editor or raw HTML, with merge fields. */
export function WizardEmailBody({
  bodyHtml,
  setBodyHtml,
  htmlMode,
  setHtmlMode,
}: {
  bodyHtml: string;
  setBodyHtml: (html: string) => void;
  htmlMode: boolean;
  setHtmlMode: (html: boolean) => void;
}) {
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<EmailRichEditorHandle>(null);

  const insertField = (token: string) =>
    htmlMode
      ? insertAtCursor(htmlRef.current, bodyHtml, setBodyHtml, token)
      : editorRef.current?.insertText(token);

  return (
    <div className="space-y-2">
      <TemplateFieldPicker onPick={insertField} />
      <EmailBodyField
        bodyHtml={bodyHtml}
        setBodyHtml={setBodyHtml}
        htmlMode={htmlMode}
        setHtmlMode={setHtmlMode}
        htmlRef={htmlRef}
        editorRef={editorRef}
        onFocus={() => {}}
      />
    </div>
  );
}
