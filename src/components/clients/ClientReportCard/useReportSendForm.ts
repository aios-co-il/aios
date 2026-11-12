import { useEffect, useState } from "react";
import { useReportSenderChoice } from "@/components/report-sender/useReportSenderChoice";
import { buildDefaultReportRecipientEmails } from "@/lib/defaultReportEmailRecipients";
import type { ReportEmailSender } from "../ReportEmailSenderSelect";
import type { ClientSendContacts } from "./useClientSendContacts";

/** The value that means "no group, send to the phone". */
export const NO_GROUP = "__none__";

/**
 * The send form's choices: channels, WhatsApp line, group or phone, email
 * sender, recipients, subject and message. They are prefilled once per
 * client, when that client and the tenant's groups have loaded, so a client
 * switch or a slow load never leaves another client's destination behind.
 */
export function useReportSendForm(
  tenantId: string,
  clientId: string,
  contacts: ClientSendContacts,
  /** The email subject until the user edits it; it names the client once loaded. */
  defaultSubject: string,
) {
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [pickedGroupId, setGroupId] = useState(NO_GROUP);
  const [phone, setPhone] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<Array<string>>([]);
  const [emailSender, setEmailSender] = useState<ReportEmailSender | null>(
    null,
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const waSender = useReportSenderChoice(tenantId);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const { client, groups, loaded } = contacts;
  const contactsReady = loaded && client?.id === clientId;

  useEffect(() => {
    if (!contactsReady || !client || prefilledFor === clientId) {
      return;
    }
    setPrefilledFor(clientId);
    setPhone(client.phone ?? "");
    setGroupId(listedGroup(client.whatsapp_group_id, groups) ?? NO_GROUP);
    setEmailRecipients(buildDefaultReportRecipientEmails(client.email));
    setSubject(defaultSubject);
  }, [contactsReady, client, clientId, groups, defaultSubject, prefilledFor]);

  // Only a group the picker lists is sent to: one it cannot show (blocked or
  // gone) would be a destination the user never saw.
  const groupId = listedGroup(pickedGroupId, groups) ?? NO_GROUP;
  return {
    /** The client's contacts have loaded and prefilled the form. */
    ready: contactsReady && prefilledFor === clientId,
    contactsFailed: contacts.failed,
    sendWhatsApp,
    setSendWhatsApp,
    sendEmail,
    setSendEmail,
    groupId,
    setGroupId,
    hasGroup: groupId !== NO_GROUP,
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

/** The group id when the tenant's group list holds it, else null. */
function listedGroup(
  groupId: string | null,
  groups: ClientSendContacts["groups"],
): string | null {
  return groupId && groups?.some((group) => group.id === groupId)
    ? groupId
    : null;
}
