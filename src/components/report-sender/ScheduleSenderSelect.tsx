import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { pickReportSender } from "../../../supabase/functions/_shared/report-sender/pick.ts";
import {
  reportSenderLabel,
  reportSenderOptionLabel,
} from "./reportSenderLabel";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import { useReportSenders } from "./useReportSenders";

/** Select value for "follow the organization default" (a NULL line). */
const TENANT_DEFAULT = "__tenant_default__";

type Props = {
  tenantId: string;
  /** report_schedules.whatsapp_integration_id; null follows the default. */
  value: string | null;
  onChange: (integrationId: string | null) => void;
};

/**
 * "שלח מ:" for a scheduled report. The default option names the line the
 * worker would use today; saving the schedule makes the saver its creator,
 * so "own line" is resolved for the current user.
 */
export function ScheduleSenderSelect({ tenantId, value, onChange }: Props) {
  const { userId } = useCurrentUser();
  const { data } = useReportSenders(tenantId);
  if (!data) {
    return null;
  }
  const readyCount = data.senders.filter((sender) => sender.ready).length;
  if (readyCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const fallback = pickReportSender({
    senders: data.senders,
    tenantDefaultId: data.tenantDefaultId,
    callerUserId: userId,
  });
  const defaultLabel =
    "error" in fallback ? "לא נבחר טלפון" : reportSenderLabel(fallback.sender);
  if (readyCount === 1 && !value) {
    return (
      <p className="text-xs text-muted-foreground">יישלח מ: {defaultLabel}</p>
    );
  }
  const missing =
    !!value && !data.senders.some((sender) => sender.id === value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">שלח מ:</Label>
      <Select
        value={value ?? TENANT_DEFAULT}
        onValueChange={(next) =>
          onChange(next === TENANT_DEFAULT ? null : next)
        }
      >
        <SelectTrigger className="h-8 text-xs" aria-label="שלח מ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value={TENANT_DEFAULT}
          >{`ברירת המחדל של הארגון (${defaultLabel})`}</SelectItem>
          {data.senders.map((sender) => (
            <SelectItem
              key={sender.id}
              value={sender.id}
              disabled={!sender.ready}
            >
              {reportSenderOptionLabel(sender)}
            </SelectItem>
          ))}
          {missing && value && (
            <SelectItem value={value} disabled>
              הטלפון שנבחר כבר לא זמין
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {missing && (
        <p className="text-xs text-amber-600">
          {REPORT_SENDER_MESSAGES.sender_not_allowed}
        </p>
      )}
    </div>
  );
}
