import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usableReportSender,
  usableReportSenders,
} from "../../../supabase/functions/_shared/report-sender/pick.ts";
import { reportSenderLabel } from "./reportSenderLabel";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import type { ScheduleSenderState } from "./scheduleSender";
import { SenderOptions } from "./SenderOptions";
import type { ScheduleSenderField } from "./useScheduleSender";

/** Select value for "follow the organization default" (a NULL line). */
const TENANT_DEFAULT = "__tenant_default__";

/**
 * "שלח מ:" for a scheduled report. A single phone is shown, not offered; a
 * stored line that no longer sends, or no line at all, is said plainly.
 */
export function ScheduleSenderSelect({
  field,
}: {
  field: ScheduleSenderField;
}) {
  const { options, state } = field;
  if (!options || state.status === "pending") {
    return null;
  }
  if (state.status === "none" && state.error === "no_report_sender") {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const ready = usableReportSenders(options.senders);
  if (
    ready.length === 1 &&
    state.status === "line" &&
    state.sender.id === ready[0].id
  ) {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.sends_from} {reportSenderLabel(state.sender)}
      </p>
    );
  }
  const orgDefault = usableReportSender(
    options.senders,
    options.tenantDefaultId,
  );
  return (
    <div className="space-y-1">
      <Label className="text-xs">{REPORT_SENDER_MESSAGES.send_from}:</Label>
      <Select
        value={selectValue(state)}
        onValueChange={(next) =>
          field.choose(next === TENANT_DEFAULT ? null : next)
        }
      >
        <SelectTrigger
          className="h-8 text-xs"
          aria-label={REPORT_SENDER_MESSAGES.send_from}
        >
          <SelectValue placeholder={REPORT_SENDER_MESSAGES.choose_phone} />
        </SelectTrigger>
        <SelectContent>
          {orgDefault && ready.length > 1 && (
            <SelectItem value={TENANT_DEFAULT}>
              {`ברירת המחדל של הארגון (${reportSenderLabel(orgDefault)})`}
            </SelectItem>
          )}
          <SenderOptions
            senders={options.senders}
            missingId={state.status === "unusable" ? state.savedId : null}
          />
        </SelectContent>
      </Select>
      {"error" in state && (
        <p className="text-xs text-amber-600">
          {REPORT_SENDER_MESSAGES[state.error]}
        </p>
      )}
    </div>
  );
}

/** The select's value: the default option, a line, or none yet. */
function selectValue(state: ScheduleSenderState): string {
  switch (state.status) {
    case "follows_default":
      return TENANT_DEFAULT;
    case "line":
      return state.sender.id;
    case "unusable":
      return state.savedId;
    default:
      return "";
  }
}
