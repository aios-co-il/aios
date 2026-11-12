import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { sendReportWhatsApp } from "@/components/report-sender/sendReportWhatsApp";
import { toastReportSent } from "@/components/report-sender/toastReportSent";
import { useRecordReportDelivery } from "@/hooks/useRecordReportDelivery";
import { useTenantPath } from "@/hooks/useTenantPath";
import type { ReportDeliveryChannel } from "@/lib/reportDelivery";
import { emailReportImage } from "./emailReportImage";
import { reportSendCopy, type ReportTarget } from "./reportSendKinds";
import type { ReportSendForm } from "./useReportSendForm";

/** Where a send stands: photographing the summary, then delivering it. */
export type SendPhase = "idle" | "capturing" | "sending";

type Options = {
  target: ReportTarget;
  tenantId: string;
  clientId: string;
  clientName: string | null;
  form: ReportSendForm;
  /** The share link the caption and email point to; the capture renders it too. */
  shareUrl: string | null;
  /** Photographs the summary at the window picked in the card. */
  capture: () => Promise<Blob>;
};

/**
 * Sends the report from the client card: checks the form, photographs the
 * summary once, delivers it on the chosen channels and records the delivery.
 */
export function useReportSend(options: Options) {
  const { target, tenantId, clientId, form, shareUrl } = options;
  const recordDelivery = useRecordReportDelivery();
  const navigate = useNavigate();
  const { buildPath } = useTenantPath();
  const [phase, setPhase] = useState<SendPhase>("idle");
  const copy = reportSendCopy(target);

  /** Runs the send; every outcome is told in a toast. */
  async function send() {
    const problem = formProblem(form, shareUrl);
    if (problem) {
      toast.error(problem);
      return;
    }
    setPhase("capturing");
    const image = await captureOrNull(options.capture);
    if (!image) {
      setPhase("idle");
      return;
    }
    setPhase("sending");
    const sent: Array<ReportDeliveryChannel> = [];
    try {
      if (form.sendWhatsApp) {
        const result = await sendReportWhatsApp({
          tenantId,
          pick: form.waSender.pick,
          file: image,
          fileName: copy.whatsAppFileName,
          fileType: "image",
          caption: copy.caption(form.message, shareUrl),
          groupId: form.hasGroup ? form.groupId : null,
          phoneNumber: form.hasGroup ? null : form.phone,
          clientId,
          sendKind: copy.sendKind,
          sendRef: target.id,
        });
        sent.push("whatsapp");
        toastReportSent(result, copy.whatsAppSentToast);
      }
      if (form.sendEmail) {
        await emailReportImage({
          copy,
          image,
          recipients: form.emailRecipients,
          subject: form.subject || copy.defaultSubject(options.clientName),
          message: form.message,
          clientName: options.clientName,
          shareUrl,
          sender: form.emailSender,
        });
        sent.push("email");
        toast.success(copy.emailSentToast);
      }
    } catch (error) {
      toastSendError(error, () => navigate(buildPath("/gmail-settings")));
    } finally {
      recordDelivery.mutate({
        tenantId,
        clientId,
        targetType: target.kind,
        targetId: target.id,
        title: target.name,
        shareUrl,
        requested: { whatsapp: form.sendWhatsApp, email: form.sendEmail },
        sent,
        emailRecipients: form.emailRecipients,
      });
      setPhase("idle");
    }
  }

  return { send, phase };
}

/** Why the form cannot send yet, checked before anything is photographed or sent. */
function formProblem(
  form: ReportSendForm,
  shareUrl: string | null,
): string | null {
  if (!form.sendWhatsApp && !form.sendEmail) {
    return "יש לבחור לפחות אמצעי שליחה אחד";
  }
  if (form.sendWhatsApp && !form.hasGroup && !form.phone) {
    return "יש לבחור קבוצת וואטסאפ או להזין מספר טלפון";
  }
  if (form.sendEmail && form.emailRecipients.length === 0) {
    return "יש לבחור לפחות נמען אימייל אחד";
  }
  if (!shareUrl) {
    return "קישור השיתוף עדיין לא מוכן";
  }
  return null;
}

/** The summary image, or null after telling why it could not be taken. */
async function captureOrNull(capture: () => Promise<Blob>) {
  try {
    return await capture();
  } catch (error) {
    console.error("Report summary capture failed:", error);
    toast.error(`שגיאה בצילום: ${errorMessage(error)}`);
    return null;
  }
}

/** Tells why the send failed, with a reconnect action when Gmail's grant expired. */
function toastSendError(error: unknown, reconnectGmail: () => void) {
  console.error("Report send failed:", error);
  const message = errorMessage(error);
  const gmailExpired =
    message.includes("Token refresh failed") ||
    message.includes("Gmail not connected") ||
    message.includes("invalid_grant");
  if (gmailExpired) {
    toast.error("חיבור ה-Gmail פג. יש להתחבר מחדש.", {
      action: { label: "התחבר מחדש", onClick: reconnectGmail },
      duration: 8000,
    });
    return;
  }
  toast.error(`שגיאה בשליחה: ${message}`);
}

/** An error's message, or a generic word when it has none. */
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "לא ידוע";
}
