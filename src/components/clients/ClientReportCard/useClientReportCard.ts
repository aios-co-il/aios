import { reportSendCopy, type ReportTarget } from "./reportSendKinds";
import { useClientSendContacts } from "./useClientSendContacts";
import {
  type ShareTokenSource,
  useEnsureShareToken,
} from "./useEnsureShareToken";
import { useExportReportPdf } from "./useExportReportPdf";
import { useReportSend } from "./useReportSend";
import { useReportSendForm } from "./useReportSendForm";
import { type CaptureImage, useSummaryCapture } from "./useSummaryCapture";

type Options = {
  target: ReportTarget;
  clientId: string;
  tenantId: string;
  shareSource: ShareTokenSource;
  buildShareUrl: (shareToken: string) => string;
  /** Photographs the hidden summary render: JPEG for a dashboard, PNG for a report. */
  captureImage: CaptureImage;
};

/**
 * What both client card report panels share: the share token the live view
 * renders with, the summary capture taken only on send or export, the send
 * form and the send itself.
 */
export function useClientReportCard(options: Options) {
  const { target, clientId, tenantId } = options;
  const share = useEnsureShareToken(options.shareSource);
  const summary = useSummaryCapture(options.captureImage);
  const contacts = useClientSendContacts(clientId, tenantId);
  const clientName = contacts.client?.name ?? null;
  const copy = reportSendCopy(target);
  const form = useReportSendForm(
    tenantId,
    contacts.client,
    copy.defaultSubject(clientName),
  );
  const shareUrl = share.token ? options.buildShareUrl(share.token) : null;
  const sender = useReportSend({
    target,
    tenantId,
    clientId,
    clientName,
    form,
    shareUrl,
    capture: summary.capture,
  });
  const pdf = useExportReportPdf(summary.capture, copy.pdfFileName);
  return { share, summary, contacts, form, sender, pdf };
}
