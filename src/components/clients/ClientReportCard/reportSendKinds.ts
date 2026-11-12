import type { ReportSendKind } from "@/components/report-sender/sendReportWhatsApp";

/** What the client card sends: a dashboard or a single report table. */
export type ReportTarget = {
  kind: "dashboard" | "table";
  id: string;
  name: string;
};

/** The words, file and delivery stamps of one kind of report send. */
export type ReportSendCopy = {
  whatsAppFileName: string;
  emailFileName: string;
  pdfFileName: string;
  mimeType: "image/jpeg" | "image/png";
  contentId: string;
  title: string;
  ctaLabel: string;
  whatsAppSentToast: string;
  emailSentToast: string;
  sendKind: ReportSendKind;
  caption: (message: string, shareUrl: string | null) => string;
  defaultSubject: (clientName: string | null) => string;
};

/** The copy of a dashboard send or a single report send, as each panel sent before. */
export function reportSendCopy(target: ReportTarget): ReportSendCopy {
  const { name } = target;
  if (target.kind === "dashboard") {
    return {
      whatsAppFileName: `dashboard-${name}.jpg`,
      emailFileName: "dashboard.jpg",
      pdfFileName: `dashboard-${name}.pdf`,
      mimeType: "image/jpeg",
      contentId: "dashboard-snapshot",
      title: `דשבורד ${name}`,
      ctaLabel: "צפה בדשבורד המלא",
      whatsAppSentToast: "הדשבורד נשלח בוואטסאפ",
      emailSentToast: "הדשבורד נשלח באימייל",
      // A dashboard share: the client card logs it once, from report_deliveries.
      sendKind: "dashboard_share",
      caption: (message, shareUrl) =>
        `${message}\n\n📊 צפה בדשבורד המלא: ${shareUrl || ""}`,
      defaultSubject: (clientName) => `דשבורד ${name}${forClient(clientName)}`,
    };
  }
  return {
    whatsAppFileName: `report-${name}.png`,
    emailFileName: `report-${name}.png`,
    pdfFileName: `report-${name}.pdf`,
    mimeType: "image/png",
    contentId: "report-snapshot",
    title: `דוח ${name}`,
    ctaLabel: "צפה בדוח המלא",
    whatsAppSentToast: "הדוח נשלח בוואטסאפ בהצלחה",
    emailSentToast: "הדוח נשלח באימייל בהצלחה",
    // A report send: the client card logs it once, from report_deliveries.
    sendKind: "report",
    caption: (message, shareUrl) =>
      `${message}${shareUrl ? `\n📊 צפה בדוח המלא: ${shareUrl}` : ""}`,
    defaultSubject: (clientName) => `דוח ${name}${forClient(clientName)}`,
  };
}

/** The subject's client suffix, empty until the client's name is known. */
function forClient(clientName: string | null): string {
  return clientName ? ` - ${clientName}` : "";
}
