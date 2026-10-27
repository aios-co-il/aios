import { Smartphone } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import {
  reportSenderLabel,
  reportSenderOptionLabel,
} from "./reportSenderLabel";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import { type ReportSenderOptions, useReportSenders } from "./useReportSenders";
import { useSetReportSender } from "./useSetReportSender";

/** Select value for "no fixed line"; Radix Select cannot hold an empty value. */
const NO_DEFAULT = "__no_default__";

/**
 * The organization's report phone ("שליחת דוחות מהטלפון"). Owners choose it
 * when there is more than one line; everyone else sees which line is used.
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
        <p className="text-sm font-medium">שליחת דוחות מהטלפון</p>
      </div>
      <DefaultLine tenantId={tenantId} options={data} />
    </div>
  );
}

/** The line in use, or the owner's choice of it. */
function DefaultLine({
  tenantId,
  options,
}: {
  tenantId: string;
  options: ReportSenderOptions;
}) {
  const save = useSetReportSender(tenantId);
  const ready = options.senders.filter((sender) => sender.ready);
  if (ready.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const current = options.senders.find(
    (sender) => sender.id === options.tenantDefaultId,
  );
  const canChoose =
    options.canManage && (ready.length > 1 || !!options.tenantDefaultId);
  if (!canChoose) {
    return (
      <p className="text-xs text-muted-foreground">
        {inUseText(current ?? onlyLine(ready))}
      </p>
    );
  }
  return (
    <Select
      value={options.tenantDefaultId ?? NO_DEFAULT}
      onValueChange={(value) =>
        save.mutate(value === NO_DEFAULT ? null : value)
      }
      disabled={save.isPending}
    >
      <SelectTrigger className="h-8 text-xs" aria-label="שלח דוחות מ">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_DEFAULT}>
          בלי טלפון קבוע: בוחרים בכל שליחה
        </SelectItem>
        {options.senders.map((sender) => (
          <SelectItem
            key={sender.id}
            value={sender.id}
            disabled={!sender.ready}
          >
            {reportSenderOptionLabel(sender)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The single ready line, when there is exactly one. */
function onlyLine(ready: ReportSender[]): ReportSender | undefined {
  return ready.length === 1 ? ready[0] : undefined;
}

/** "Reports go out from …", or that each send names its phone. */
function inUseText(sender: ReportSender | undefined): string {
  return sender
    ? `דוחות נשלחים מ: ${reportSenderLabel(sender)}`
    : "אין טלפון קבוע לדוחות: בוחרים טלפון בכל שליחה";
}
