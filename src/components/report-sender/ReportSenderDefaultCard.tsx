import { Smartphone } from "lucide-react";
import {
  pickReportSender,
  usableReportSender,
  usableReportSenders,
} from "../../../supabase/functions/_shared/report-sender/pick.ts";
import { ReportSenderDefaultSelect } from "./ReportSenderDefaultSelect";
import { reportSenderLabel } from "./reportSenderLabel";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import { type ReportSenderOptions, useReportSenders } from "./useReportSenders";

/** What the default covers once schedules store their own line. */
const DEFAULT_SCOPE =
  'משמש כברירת מחדל בכל שליחה חדשה, ובתזמונים שמוגדרים לשלוח לפי "ברירת המחדל של הארגון". תזמונים שנבחר להם טלפון משלהם ממשיכים לשלוח ממנו.';

/**
 * The organization's default report phone: preselected in every new send and
 * used by schedules set to follow it, while a schedule with its own line
 * keeps it. Owners choose it unless a single own line leaves no choice;
 * everyone else sees which line is used. A default that can no longer send
 * is flagged, because the sends that rely on it fail until it is replaced.
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
        <p className="text-sm font-medium">טלפון ברירת המחדל לשליחת דוחות</p>
      </div>
      <p className="text-xs text-muted-foreground">{DEFAULT_SCOPE}</p>
      <DefaultLine tenantId={tenantId} options={data} />
    </div>
  );
}

/**
 * The line in use, or the owner's choice of it, and a stale-default note. A
 * default that no longer serves every member (switched off, unshared, or made
 * private) is stale: the sends of those who may not use it fail.
 */
function DefaultLine({
  tenantId,
  options,
}: {
  tenantId: string;
  options: ReportSenderOptions;
}) {
  const ready = usableReportSenders(options.senders);
  if (ready.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const stale =
    !!options.tenantDefaultId &&
    !usableReportSender(options.senders, options.tenantDefaultId)?.org_wide;
  // A single own line is used without a default; a shared one never is.
  const onlyOwnLine =
    !options.tenantDefaultId && ready.length === 1 && !ready[0].is_shared;
  const canChoose = options.canManage && !onlyOwnLine;
  return (
    <>
      {canChoose && (
        <ReportSenderDefaultSelect tenantId={tenantId} options={options} />
      )}
      {!canChoose && !stale && (
        <p className="text-xs text-muted-foreground">{inUseText(options)}</p>
      )}
      {stale && (
        <p className="text-xs text-amber-600">
          {options.canManage
            ? REPORT_SENDER_MESSAGES.stale_default_owner
            : REPORT_SENDER_MESSAGES.stale_default}
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
