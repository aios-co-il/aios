import {
  type ReportWhatsAppResult,
  sendReportWhatsApp,
} from "@/components/report-sender/sendReportWhatsApp";
import type { ReportSenderChoicePick } from "@/components/report-sender/useReportSenderChoice";
import type { ReportDeliveryChannel } from "@/lib/reportDelivery";
import type { ReportEmailSender } from "../ReportEmailSenderSelect";
import { emailReportImage } from "./emailReportImage";
import type { ReportSendCopy, ReportTarget } from "./reportSendKinds";

/**
 * Where one send goes, fixed when the user presses send: the destination the
 * form showed then, never a value that changed while the summary was taken.
 */
export type ReportDestination = {
  whatsApp: {
    pick: ReportSenderChoicePick;
    groupId: string | null;
    phone: string | null;
  } | null;
  email: {
    recipients: Array<string>;
    subject: string;
    sender: ReportEmailSender | null;
  } | null;
  message: string;
};

type Delivery = {
  copy: ReportSendCopy;
  target: ReportTarget;
  tenantId: string;
  clientId: string;
  clientName: string | null;
  shareUrl: string;
  image: Blob;
  destination: ReportDestination;
};

/** One channel's outcome. */
export type ChannelResult =
  | {
      channel: ReportDeliveryChannel;
      ok: true;
      whatsApp?: ReportWhatsAppResult;
    }
  | { channel: ReportDeliveryChannel; ok: false; error: unknown };

/**
 * Delivers the summary on each chosen channel independently: a WhatsApp
 * failure does not stop the email, nor the other way round.
 */
export async function deliverReport(
  delivery: Delivery,
): Promise<Array<ChannelResult>> {
  const results: Array<ChannelResult> = [];
  const { whatsApp, email } = delivery.destination;
  if (whatsApp) {
    results.push(
      await attempt("whatsapp", async () => ({
        whatsApp: await sendWhatsApp(delivery, whatsApp),
      })),
    );
  }
  if (email) {
    results.push(
      await attempt("email", async () => {
        await sendEmail(delivery, email);
        return {};
      }),
    );
  }
  return results;
}

/** Runs one channel's send and turns its outcome into a result. */
async function attempt(
  channel: ReportDeliveryChannel,
  send: () => Promise<{ whatsApp?: ReportWhatsAppResult }>,
): Promise<ChannelResult> {
  try {
    return { channel, ok: true, ...(await send()) };
  } catch (error) {
    console.error(`Report ${channel} send failed:`, error);
    return { channel, ok: false, error };
  }
}

/** Sends the summary image to the WhatsApp group or phone. */
function sendWhatsApp(
  delivery: Delivery,
  whatsApp: NonNullable<ReportDestination["whatsApp"]>,
) {
  const { copy, destination } = delivery;
  return sendReportWhatsApp({
    tenantId: delivery.tenantId,
    pick: whatsApp.pick,
    file: delivery.image,
    fileName: copy.whatsAppFileName,
    fileType: "image",
    caption: copy.caption(destination.message, delivery.shareUrl),
    groupId: whatsApp.groupId,
    phoneNumber: whatsApp.phone,
    clientId: delivery.clientId,
    sendKind: copy.sendKind,
    sendRef: delivery.target.id,
  });
}

/** Emails the summary image to the chosen recipients. */
function sendEmail(
  delivery: Delivery,
  email: NonNullable<ReportDestination["email"]>,
) {
  return emailReportImage({
    copy: delivery.copy,
    image: delivery.image,
    recipients: email.recipients,
    subject: email.subject,
    message: delivery.destination.message,
    clientName: delivery.clientName,
    shareUrl: delivery.shareUrl,
    sender: email.sender,
  });
}
