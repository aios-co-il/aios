import { Smartphone } from "lucide-react";
import {
  pickReportSender,
  usableReportSender,
} from "../../../supabase/functions/_shared/report-sender/pick.ts";
import { ReportSenderDefaultSelect } from "./ReportSenderDefaultSelect";
import { reportSenderLabel } from "./reportSenderLabel";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import { type ReportSenderOptions, useReportSenders } from "./useReportSenders";

/**
 * The organization's report phone, one setting for every client. Owners
 * choose it when there is more than one line; everyone else sees which line
 * is used. A default whose line was switched off is flagged: sends skip it.
 */
export function ReportSenderDefaultCard({ tenantId }: { tenantId: string }) {
  const { data } = useReportSenders(tenantId);
  if (!data) {
    return null;
  }
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3" dir="rtl">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">
          טלפון שליחת הדוחות (לכל הלקוחות בארגון)
        </p>
      </div>
      <DefaultLine tenantId={tenantId} options={data} />
    </div>
  );
}

/** The line in use, or the owner's choice of it, and a stale-default note. */
function DefaultLine({
  tenantId,
  options,
}: {
  tenantId: string;
  options: ReportSenderOptions;
}) {
  const readyCount = options.senders.filter((sender) => sender.ready).length;
  if (readyCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const stale =
    !!options.tenantDefaultId &&
    !usableReportSender(options.senders, options.tenantDefaultId);
  const canChoose =
    options.canManage && (readyCount > 1 || !!options.tenantDefaultId);
  return (
    <>
      {canChoose ? (
        <ReportSenderDefaultSelect tenantId={tenantId} options={options} />
      ) : (
        <p className="text-xs text-muted-foreground">{inUseText(options)}</p>
      )}
      {stale && (
        <p className="text-xs text-amber-600">
          {REPORT_SENDER_MESSAGES.stale_default}
        </p>
      )}
    </>
  );
}

/** "Reports go out from …" when one line resolves for everyone, else how. */
function inUseText(options: ReportSenderOptions): string {
  const pick = pickReportSender({
    senders: options.senders,
    tenantDefaultId: options.tenantDefaultId,
  });
  return "error" in pick
    ? "אין טלפון קבוע לדוחות: הטלפון נבחר בכל שליחה ובכל תזמון"
    : `דוחות נשלחים מ: ${reportSenderLabel(pick.sender)}`;
}
