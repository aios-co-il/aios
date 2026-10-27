import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usableReportSenders } from "../../../supabase/functions/_shared/report-sender/pick.ts";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { reportSenderLabel } from "./reportSenderLabel";
import { pickErrorKey, REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import { SenderOptions } from "./SenderOptions";
import type { ReportSenderChoice } from "./useReportSenderChoice";

type Props = {
  choice: ReportSenderChoice;
  /** The dialog's WhatsApp groups, to warn when the line is not in the chosen one. */
  groups?: readonly { id: string; group_chat_id?: string | null }[];
  /** The chosen group's whatsapp_groups.id. */
  groupId?: string | null;
};

/**
 * Which phone a report goes out from. One line is shown, not offered; several
 * lines, or one shared by another organization, are a choice (the tenant
 * default or the sender's own line first); none is a clear message, and the
 * send then fails with the same text.
 */
export function ReportSenderPicker({ choice, groups, groupId }: Props) {
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
  const readyCount = usableReportSenders(senders).length;
  if (readyCount === 0) {
    return (
      <p className="text-xs text-destructive" role="status">
        {REPORT_SENDER_MESSAGES.no_report_sender}
      </p>
    );
  }
  const selected = "error" in pick ? null : pick.sender;
  const groupChatId = groups?.find(
    (group) => group.id === groupId,
  )?.group_chat_id;
  return (
    <div className="space-y-1" dir="rtl">
      {readyCount === 1 && selected ? (
        <p className="text-xs text-muted-foreground">
          {REPORT_SENDER_MESSAGES.sends_from}{" "}
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
          {REPORT_SENDER_MESSAGES[pickErrorKey(pick)]}
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
      <Label className="text-xs text-muted-foreground">
        {REPORT_SENDER_MESSAGES.send_from}:
      </Label>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger
          className="h-8 text-xs"
          aria-label={REPORT_SENDER_MESSAGES.send_from}
        >
          <SelectValue placeholder={REPORT_SENDER_MESSAGES.choose_phone} />
        </SelectTrigger>
        <SelectContent>
          <SenderOptions senders={props.senders} />
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
