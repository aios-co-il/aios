import { useEffect, useState } from "react";
import { useReportSenderChoice } from "@/components/report-sender/useReportSenderChoice";
import { buildDefaultReportRecipientEmails } from "@/lib/defaultReportEmailRecipients";
import type { ReportEmailSender } from "../ReportEmailSenderSelect";

/** The client fields the form prefills from. */
type PrefillClient = {
  name: string | null;
  phone: string | null;
  email: string | null;
  whatsapp_group_id: string | null;
} | null;

/** The value that means "no group, send to the phone". */
const NO_GROUP = "__none__";

/**
 * The send form's choices: channels, WhatsApp line, group or phone, email
 * sender, recipients, subject and message, prefilled from the client and the
 * default report distribution list.
 */
export function useReportSendForm(
  tenantId: string,
  client: PrefillClient,
  /** The email subject until the user edits it; it names the client once loaded. */
  defaultSubject: string,
) {
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [phone, setPhone] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<Array<string>>([]);
  const [emailSender, setEmailSender] = useState<ReportEmailSender | null>(
    null,
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const waSender = useReportSenderChoice(tenantId);

  useEffect(() => {
    if (client) {
      if (client.phone) {
        setPhone(client.phone);
      }
      if (client.whatsapp_group_id) {
        setGroupId(client.whatsapp_group_id);
      }
      setSubject((prev) => prev || defaultSubject);
    }
    setEmailRecipients((prev) =>
      prev.length === 0
        ? buildDefaultReportRecipientEmails(client?.email)
        : prev,
    );
  }, [client, defaultSubject]);

  const hasGroup = !!groupId && groupId !== NO_GROUP;
  return {
    sendWhatsApp,
    setSendWhatsApp,
    sendEmail,
    setSendEmail,
    groupId,
    setGroupId,
    hasGroup,
    phone,
    setPhone,
    emailRecipients,
    setEmailRecipients,
    emailSender,
    setEmailSender,
    subject,
    setSubject,
    message,
    setMessage,
    waSender,
  };
}

/** The send form's state, as the form and the send flow read it. */
export type ReportSendForm = ReturnType<typeof useReportSendForm>;
