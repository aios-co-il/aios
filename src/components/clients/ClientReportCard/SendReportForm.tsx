import type { ReactNode } from "react";
import { Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { ReportSenderPicker } from "@/components/report-sender/ReportSenderPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildReportEmailOptions } from "@/lib/defaultReportEmailRecipients";
import { EmailRecipientsSelector } from "../EmailRecipientsSelector";
import { ReportEmailSenderSelect } from "../ReportEmailSenderSelect";
import { WhatsAppGroupSelect } from "../WhatsAppGroupSelect";
import type { useClientSendContacts } from "./useClientSendContacts";
import type { SendPhase } from "./useReportSend";
import type { ReportSendForm } from "./useReportSendForm";

type Props = {
  form: ReportSendForm;
  contacts: ReturnType<typeof useClientSendContacts>;
  /** The single report lets the user edit the email subject. */
  showSubject: boolean;
  sendLabel: string;
  phase: SendPhase;
  onSend: () => void;
  /** Extra rows above the message, such as the share link status. */
  children?: ReactNode;
};

/** The client card's send controls: channels, recipients, message and the send button. */
export function SendReportForm({
  form,
  contacts,
  showSubject,
  sendLabel,
  phase,
  onSend,
  children,
}: Props) {
  const { client, groups, teamMembers } = contacts;
  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={form.sendWhatsApp}
            onCheckedChange={(checked) => form.setSendWhatsApp(!!checked)}
          />
          <MessageCircle className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs">וואטסאפ</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={form.sendEmail}
            onCheckedChange={(checked) => form.setSendEmail(!!checked)}
          />
          <Mail className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs">אימייל</span>
        </label>
      </div>

      {form.sendWhatsApp && (
        <div className="space-y-2">
          <ReportSenderPicker
            choice={form.waSender}
            groups={groups}
            groupId={form.groupId}
          />
          <WhatsAppGroupSelect
            groups={groups}
            value={form.groupId}
            onValueChange={form.setGroupId}
            triggerClassName="h-8 text-xs"
            noneLabel="ללא קבוצה - שלח לטלפון"
          />
          {!form.hasGroup && (
            <Input
              value={form.phone}
              onChange={(event) => form.setPhone(event.target.value)}
              placeholder="05xxxxxxxx"
              className="h-8 text-xs"
            />
          )}
        </div>
      )}

      {form.sendEmail && (
        <div className="space-y-2">
          <ReportEmailSenderSelect
            value={form.emailSender}
            onChange={form.setEmailSender}
          />
          <EmailRecipientsSelector
            options={buildReportEmailOptions({
              clientEmail: client?.email,
              clientName: client?.name,
              teamMembers,
            })}
            selectedEmails={form.emailRecipients}
            onChange={form.setEmailRecipients}
          />
          {showSubject && (
            <Input
              value={form.subject}
              onChange={(event) => form.setSubject(event.target.value)}
              placeholder="נושא האימייל..."
              className="h-8 text-xs"
              dir="rtl"
            />
          )}
        </div>
      )}

      {children}

      <Textarea
        value={form.message}
        onChange={(event) => form.setMessage(event.target.value)}
        placeholder="טקסט מלווה (אופציונלי)..."
        rows={2}
        className="text-xs"
      />

      <Button
        onClick={onSend}
        disabled={phase !== "idle"}
        size="sm"
        className="w-full gap-1"
      >
        {phase === "idle" ? (
          <>
            <Send className="h-3.5 w-3.5" /> {sendLabel}
          </>
        ) : (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {phase === "capturing" ? "מצלם את הסיכום..." : "שולח..."}
          </>
        )}
      </Button>
    </div>
  );
}
