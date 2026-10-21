// The channel-specific content of a message template: what a send copies from
// it. Structural input (no generated types) so the frontend can import it.
import {
  type EmailAttachment,
  toEmailAttachments,
} from "./email-attachments.ts";

export type TemplateContentSource = {
  channel: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  html_mode: boolean | null;
  attachments: unknown;
  media_url: string | null;
};

export type EmailTemplateContent = {
  channel: "email";
  subject: string | null;
  /** Plain-text fallback sent alongside the HTML body. */
  bodyText: string | null;
  bodyHtml: string | null;
  htmlMode: boolean;
  attachments: EmailAttachment[];
};

export type WhatsappTemplateContent = {
  channel: "whatsapp";
  bodyText: string | null;
  mediaUrl: string | null;
};

export type TemplateContent = EmailTemplateContent | WhatsappTemplateContent;

/** Email templates keep subject/HTML/attachments; anything else is WhatsApp
 * and keeps the text and media. */
export function templateContent(t: TemplateContentSource): TemplateContent {
  if (t.channel === "email") {
    return {
      channel: "email",
      subject: t.subject,
      bodyText: t.body_text,
      bodyHtml: t.body_html,
      htmlMode: !!t.html_mode,
      attachments: toEmailAttachments(t.attachments),
    };
  }
  return { channel: "whatsapp", bodyText: t.body_text, mediaUrl: t.media_url };
}
