import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useRecordReportDelivery } from "@/hooks/useRecordReportDelivery";
import { useTenantPath } from "@/hooks/useTenantPath";
import { deliverReport, type ReportDestination } from "./deliverReport";
import {
  reportSendCopy,
  type ReportSendCopy,
  type ReportTarget,
} from "./reportSendKinds";
import { errorMessage, toastChannelResult } from "./reportSendToasts";
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
 * Sends the report from the client card: checks the form, fixes the shown
 * destination, photographs the summary once, delivers it on each chosen
 * channel on its own and records the channels that went out.
 */
export function useReportSend(options: Options) {
  const { target, tenantId, clientId, form } = options;
  const recordDelivery = useRecordReportDelivery();
  const navigate = useNavigate();
  const { buildPath } = useTenantPath();
  const [phase, setPhase] = useState<SendPhase>("idle");
  const copy = reportSendCopy(target);

  /** Runs the send; every outcome is told in a toast. */
  async function send() {
    const problem = formProblem(form, options.shareUrl);
    if (problem || !options.shareUrl) {
      toast.error(problem ?? "אין קישור שיתוף פעיל");
      return;
    }
    const shareUrl = options.shareUrl;
    const destination = shownDestination(form, copy, options.clientName);
    setPhase("capturing");
    try {
      const image = await captureOrNull(options.capture);
      if (!image) {
        return;
      }
      setPhase("sending");
      const results = await deliverReport({
        copy,
        target,
        tenantId,
        clientId,
        clientName: options.clientName,
        shareUrl,
        image,
        destination,
      });
      results.forEach((result) =>
        toastChannelResult(result, copy, () =>
          navigate(buildPath("/gmail-settings")),
        ),
      );
      recordDelivery.mutate({
        tenantId,
        clientId,
        targetType: target.kind,
        targetId: target.id,
        title: target.name,
        shareUrl,
        requested: {
          whatsapp: !!destination.whatsApp,
          email: !!destination.email,
        },
        sent: results.flatMap((result) => (result.ok ? [result.channel] : [])),
        emailRecipients: destination.email?.recipients ?? [],
      });
    } finally {
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
  if (form.contactsFailed) {
    return "טעינת פרטי הלקוח נכשלה";
  }
  if (!form.ready) {
    return "פרטי הלקוח עדיין נטענים";
  }
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
    return "אין קישור שיתוף פעיל: יש ללחוץ על 'צור קישור' לפני השליחה";
  }
  return null;
}

/** The destination exactly as the form shows it when send is pressed. */
function shownDestination(
  form: ReportSendForm,
  copy: ReportSendCopy,
  clientName: string | null,
): ReportDestination {
  return {
    whatsApp: form.sendWhatsApp
      ? {
          pick: form.waSender.pick,
          groupId: form.hasGroup ? form.groupId : null,
          phone: form.hasGroup ? null : form.phone,
        }
      : null,
    email: form.sendEmail
      ? {
          recipients: [...form.emailRecipients],
          subject: form.subject || copy.defaultSubject(clientName),
          sender: form.emailSender,
        }
      : null,
    message: form.message,
  };
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
