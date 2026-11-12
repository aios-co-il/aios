import { supabase } from "@/integrations/supabase/client";
import { buildBrandedEmailHtml } from "@/lib/emailTemplate";
import type { ReportEmailSender } from "../ReportEmailSenderSelect";
import type { ReportSendCopy } from "./reportSendKinds";

type ReportEmail = {
  copy: ReportSendCopy;
  image: Blob;
  recipients: Array<string>;
  subject: string;
  message: string;
  clientName: string | null;
  shareUrl: string | null;
  /** A verified sending domain (Resend); null sends from the connected Gmail. */
  sender: ReportEmailSender | null;
};

/** Emails the summary image inline in the branded template; throws when not sent. */
export async function emailReportImage(email: ReportEmail): Promise<void> {
  const { copy, sender } = email;
  const content = await blobToBase64(email.image);
  const html = buildBrandedEmailHtml({
    title: copy.title,
    subtitle: email.clientName ? `עבור ${email.clientName}` : undefined,
    message: email.message,
    ctaUrl: email.shareUrl || undefined,
    ctaLabel: copy.ctaLabel,
    hasAttachment: false,
    inlineImageCid: copy.contentId,
    inlineImageAlt: copy.title,
  });
  if (sender) {
    // The same backend as broadcast emails.
    const { data, error } = await supabase.functions.invoke(
      "send-resend-email",
      {
        body: {
          to: email.recipients,
          subject: email.subject,
          html,
          fromEmail: sender.fromEmail,
          fromName: sender.fromName || undefined,
          attachments: [
            {
              filename: copy.emailFileName,
              content,
              contentType: copy.mimeType,
              content_id: copy.contentId,
            },
          ],
        },
      },
    );
    if (error) {
      throw new Error(error.message || "שגיאה בשליחה");
    }
    if (data?.error) {
      throw new Error(data.details ? JSON.stringify(data.details) : data.error);
    }
    return;
  }
  const { data, error } = await supabase.functions.invoke("gmail-api", {
    body: {
      action: "send",
      to: email.recipients.join(", "),
      subject: email.subject,
      body: html,
      attachments: [
        {
          filename: copy.emailFileName,
          mimeType: copy.mimeType,
          data: content,
          disposition: "inline",
          cid: copy.contentId,
        },
      ],
    },
  });
  if (error) {
    throw new Error(error.message || "שגיאה בשליחה");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
}

/** The blob's bytes as base64, without the data URL prefix. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
