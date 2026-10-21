import { useMemo } from "react";
import DOMPurify from "dompurify";
import type { TemplateChannel } from "@/hooks/useMessageTemplates";
import {
  buildEmailContent,
  renderTemplate,
  textToEmailHtml,
  wrapEmailHtml,
  type EmailAttachment,
  type TemplateVars,
} from "../../../supabase/functions/_shared/broadcast-template.ts";
import { Label } from "@/components/ui/label";

/** Live preview of the template rendered with sample or list-member vars. */
export function TemplatePreview({
  channel,
  sampleLabel,
  subject,
  bodyHtml,
  bodyText,
  htmlMode,
  mediaUrl,
  attachments,
  previewVars,
}: {
  channel: TemplateChannel;
  sampleLabel: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  htmlMode: boolean;
  mediaUrl: string;
  attachments: EmailAttachment[];
  previewVars: TemplateVars;
}) {
  const previewHtml = useMemo(() => {
    if (channel !== "email") return "";
    if (htmlMode)
      return buildEmailContent({ bodyHtml, htmlMode: true, vars: previewVars })
        .html;
    const raw = bodyHtml
      ? wrapEmailHtml(renderTemplate(bodyHtml, previewVars, { html: true }))
      : textToEmailHtml(renderTemplate(bodyText, previewVars));
    return DOMPurify.sanitize(raw);
  }, [channel, bodyHtml, bodyText, previewVars, htmlMode]);

  return (
    <div className="space-y-2">
      <Label>
        תצוגה מקדימה
        {sampleLabel}
      </Label>
      {channel === "email" ? (
        <div className="rounded-md border bg-white p-4 text-black">
          <div className="mb-3 border-b pb-2 text-sm font-semibold">
            {renderTemplate(subject, previewVars) || "ללא נושא"}
          </div>
          {htmlMode ? (
            <iframe
              title="תצוגה מקדימה"
              sandbox=""
              srcDoc={previewHtml}
              className="h-[480px] w-full rounded border-0 bg-white"
            />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
              {attachments.map((a) => (
                <span
                  key={a.path || a.url}
                  className="rounded border bg-gray-50 px-2 py-0.5 text-xs"
                >
                  📎 {a.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border bg-[#e5ddd5] p-4">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-3 text-sm text-black shadow-sm">
            {mediaUrl && (
              <img src={mediaUrl} alt="" className="mb-2 max-h-48 rounded" />
            )}
            {renderTemplate(bodyText, previewVars) || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
