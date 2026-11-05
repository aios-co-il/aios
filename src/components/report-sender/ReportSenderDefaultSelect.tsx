import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import { SenderOptions } from "./SenderOptions";
import type { ReportSenderOptions } from "./useReportSenders";
import { useSetReportSender } from "./useSetReportSender";

/** Select value for "no fixed line"; Radix Select cannot hold an empty value. */
const NO_DEFAULT = "__no_default__";

/**
 * The owner's choice of the organization's report phone. The default serves
 * every member, so only lines open to all of them are offered; a private
 * line stays its owner's (set_report_whatsapp_sender refuses it too).
 */
export function ReportSenderDefaultSelect({
  tenantId,
  options,
}: {
  tenantId: string;
  options: ReportSenderOptions;
}) {
  const save = useSetReportSender(tenantId);
  const orgWide = options.senders.filter((sender) => sender.org_wide);
  const hidesPrivate = orgWide.length < options.senders.length;
  return (
    <>
      <Select
        value={options.tenantDefaultId ?? NO_DEFAULT}
        onValueChange={(value) =>
          save.mutate(value === NO_DEFAULT ? null : value)
        }
        disabled={save.isPending}
      >
        <SelectTrigger
          className="h-8 text-xs"
          aria-label={REPORT_SENDER_MESSAGES.send_reports_from}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_DEFAULT}>
            {REPORT_SENDER_MESSAGES.no_fixed_sender}
          </SelectItem>
          <SenderOptions
            senders={orgWide}
            missingId={options.tenantDefaultId}
          />
        </SelectContent>
      </Select>
      {hidesPrivate && (
        <p className="text-xs text-muted-foreground">
          {REPORT_SENDER_MESSAGES.default_org_lines_only}
        </p>
      )}
    </>
  );
}
