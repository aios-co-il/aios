import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportSenderOptionLabel } from "./reportSenderLabel";
import type { ReportSenderOptions } from "./useReportSenders";
import { useSetReportSender } from "./useSetReportSender";

/** Select value for "no fixed line"; Radix Select cannot hold an empty value. */
const NO_DEFAULT = "__no_default__";

/** The owner's choice of the organization's report phone. */
export function ReportSenderDefaultSelect({
  tenantId,
  options,
}: {
  tenantId: string;
  options: ReportSenderOptions;
}) {
  const save = useSetReportSender(tenantId);
  const gone =
    !!options.tenantDefaultId &&
    !options.senders.some((sender) => sender.id === options.tenantDefaultId);
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
          בלי טלפון קבוע: הטלפון נבחר בכל שליחה ובכל תזמון
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
        {gone && options.tenantDefaultId && (
          <SelectItem value={options.tenantDefaultId} disabled>
            הטלפון שנבחר כבר לא זמין
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
