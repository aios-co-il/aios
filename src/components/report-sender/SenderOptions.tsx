import { SelectItem } from "@/components/ui/select";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { reportSenderOptionLabel } from "./reportSenderLabel";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";

/**
 * The lines of a sender select. A line that cannot send yet is shown
 * disabled; a chosen line that is no longer listed (missingId) stays as a
 * disabled "gone" option, so the select still shows that choice.
 */
export function SenderOptions({
  senders,
  missingId,
}: {
  senders: readonly ReportSender[];
  missingId?: string | null;
}) {
  const goneId =
    missingId && !senders.some((sender) => sender.id === missingId)
      ? missingId
      : null;
  return (
    <>
      {senders.map((sender) => (
        <SelectItem key={sender.id} value={sender.id} disabled={!sender.ready}>
          {reportSenderOptionLabel(sender)}
        </SelectItem>
      ))}
      {goneId && (
        <SelectItem value={goneId} disabled>
          {REPORT_SENDER_MESSAGES.sender_gone}
        </SelectItem>
      )}
    </>
  );
}
