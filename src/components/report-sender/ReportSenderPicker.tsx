import { Label } from "@/components/ui/label";
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
import type { ReportSenderChoice } from "./useReportSenderChoice";

type Props = {
  choice: ReportSenderChoice;
  /** The chosen group's chat id, to warn when the line is not in it. */
  groupChatId?: string | null;
};

/**
 * Which phone a report goes out from. One line is shown, not offered; several
 * lines are a choice (the tenant default or the sender's own line first);
 * none is a clear message, and the send then fails with the same text.
 */
export function ReportSenderPicker({ choice, groupChatId }: Props) {
  const { pick, senders } = choice;
  if (
    "error" in pick &&
    (pick.error === "loading" || pick.error === "load_failed")
  ) {
    return (
      <p className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES[pick.error]}
      </p>
    );
  }
  const readyCount = senders.filter((sender) => sender.ready).length;
  if (readyCount === 0) {
    return (
      <p className="text-xs text-destructive" role="status">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const selected = "error" in pick ? null : pick.sender;
  return (
    <div className="space-y-1" dir="rtl">
      {readyCount === 1 && selected ? (
        <p className="text-xs text-muted-foreground">
          יישלח מ:{" "}
          <span className="font-medium text-foreground">
            {reportSenderLabel(selected)}
          </span>
        </p>
      ) : (
        <SenderSelect
          senders={senders}
          value={selected?.id ?? ""}
          onChange={choice.choose}
        />
      )}
      {"error" in pick && (
        <p className="text-xs text-amber-600">
          {REPORT_SENDER_MESSAGES[pick.error]}
        </p>
      )}
      {selected && notInGroup(selected, groupChatId) && (
        <p className="text-xs text-amber-600">
          {REPORT_SENDER_MESSAGES.not_in_group}
        </p>
      )}
    </div>
  );
}

/** The list of lines; ones that cannot send yet are shown but disabled. */
function SenderSelect(props: {
  senders: ReportSender[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <>
      <Label className="text-xs text-muted-foreground">שלח מ:</Label>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger className="h-8 text-xs" aria-label="שלח מ">
          <SelectValue placeholder="בחרו טלפון" />
        </SelectTrigger>
        <SelectContent>
          {props.senders.map((sender) => (
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
    </>
  );
}

/**
 * A Manus line knows its groups (the gateway's group sync); a group outside
 * that list will not receive the report. Green API lines carry no such list.
 */
function notInGroup(
  sender: ReportSender,
  groupChatId: string | null | undefined,
): boolean {
  if (
    !groupChatId ||
    sender.integration_type !== "manus_wa" ||
    !sender.group_chat_ids
  ) {
    return false;
  }
  return !sender.group_chat_ids.includes(groupChatId);
}
