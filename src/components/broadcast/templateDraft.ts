import type { Dispatch, SetStateAction } from "react";
import type { MessageTemplate } from "@/hooks/useMessageTemplates";
import type { EmailAttachment } from "../../../supabase/functions/_shared/broadcast/template/email-attachments.ts";
import { templateContent } from "../../../supabase/functions/_shared/broadcast/template/template-content.ts";

/** Everything the template editor edits, held in one state. */
export interface TemplateDraft {
  name: string;
  subject: string;
  bodyHtml: string;
  htmlMode: boolean;
  bodyText: string;
  mediaUrl: string;
  attachments: EmailAttachment[];
}

/** The editor's draft and its setter, passed to every editor section. */
export interface TemplateDraftProps {
  draft: TemplateDraft;
  setDraft: Dispatch<SetStateAction<TemplateDraft>>;
}

const EMPTY_DRAFT: TemplateDraft = {
  name: "",
  subject: "",
  bodyHtml: "",
  htmlMode: false,
  bodyText: "",
  mediaUrl: "",
  attachments: [],
};

/** A draft from a saved template (only its channel's content), or empty. */
export function draftFrom(template: MessageTemplate | null): TemplateDraft {
  if (!template) return EMPTY_DRAFT;
  const content = templateContent(template);
  const base = { ...EMPTY_DRAFT, name: template.name };
  return content.channel === "email"
    ? {
        ...base,
        subject: content.subject || "",
        bodyHtml: content.bodyHtml || "",
        htmlMode: content.htmlMode,
        bodyText: content.bodyText || "",
        attachments: content.attachments,
      }
    : {
        ...base,
        bodyText: content.bodyText || "",
        mediaUrl: content.mediaUrl || "",
      };
}

/** A setter for one draft field. */
export function draftField<K extends keyof TemplateDraft>(
  setDraft: TemplateDraftProps["setDraft"],
  key: K,
): Dispatch<SetStateAction<TemplateDraft[K]>> {
  return (value) =>
    setDraft((d) => ({
      ...d,
      [key]: typeof value === "function" ? value(d[key]) : value,
    }));
}
