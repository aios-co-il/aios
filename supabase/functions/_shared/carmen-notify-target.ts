/**
 * Resolve who should receive Carmen outbound notify / pulse digests.
 *
 * Hard rules:
 *  - never fall back to a phone that is not an active campaigner on this tenant
 *    (blocks MarketingCaptain owner David from receiving DMM digests just
 *    because he has the newest carmen_whatsapp_sessions row).
 *  - never deliver pulse / coding-agent / health notifies to a WhatsApp group.
 *    Group session rows store the last speaker's phone, so a live group chat
 *    would otherwise steal David's private 1:1 destination.
 *  - conversation identity is the chat JID (see carmen-session-identity.ts);
 *    notify never follows the freshest live session.
 */

import { notifyReportRecipient } from "./carmen-report-recipients/notify-recipient.ts";
import { isGroupChatId } from "./carmen-session-identity.ts";
import { findSessionForPhone } from "./carmen-notify-target/delivery.ts";
import {
  normalizeNotifyPhone,
  phonesMatch,
} from "./carmen-notify-target/phone.ts";
import {
  isManagerStaffRole,
  staffSortKey,
} from "./carmen-notify-target/staff.ts";
import type {
  NotifySessionCandidate,
  NotifyStaffCandidate,
  ResolveCarmenNotifyTargetInput,
  ResolveCarmenNotifyTargetResult,
} from "./carmen-notify-target/types.ts";

export { isGroupChatId } from "./carmen-session-identity.ts";
export {
  normalizeNotifyPhone,
  phonesMatch,
} from "./carmen-notify-target/phone.ts";
export { isManagerStaffRole } from "./carmen-notify-target/staff.ts";
export { pickNotifyDelivery } from "./carmen-notify-target/delivery.ts";
export type {
  NotifySessionCandidate,
  NotifyBridgeSession,
  NotifyStaffCandidate,
  ResolveCarmenNotifyTargetInput,
  ResolveCarmenNotifyTargetResult,
} from "./carmen-notify-target/types.ts";

/**
 * Resolve the WhatsApp chat that should receive a Carmen notify / pulse update.
 */
export function resolveCarmenNotifyTarget(
  input: ResolveCarmenNotifyTargetInput,
): ResolveCarmenNotifyTargetResult {
  const sessions = input.sessions ?? [];
  const staff = [...(input.staff ?? [])]
    .filter((s) => !!normalizeNotifyPhone(s.phone))
    .sort((a, b) => staffSortKey(a) - staffSortKey(b));
  const staffPhones = staff
    .map((s) => normalizeNotifyPhone(s.phone))
    .filter((p): p is string => !!p);

  const tryPhone = (
    phoneRaw: string | null | undefined,
    source: ResolveCarmenNotifyTargetResult["source"],
    fallbackName: string | null = null,
  ): ResolveCarmenNotifyTargetResult | null => {
    const phone = normalizeNotifyPhone(phoneRaw);
    if (!phone) return null;
    // Never treat a group JID as a private notify target
    if (String(phoneRaw || "").includes("@g.us")) return null;
    const session = findSessionForPhone(sessions, phone);
    const chatId = isGroupChatId(session?.chat_id)
      ? phone
      : (session?.chat_id ?? phone);
    return {
      chatId,
      phone: normalizeNotifyPhone(session?.phone) ?? phone,
      contactName: contactNameFor(session, staff, phone) ?? fallbackName,
      source,
    };
  };

  const preferred = tryPhone(input.preferredPhone, "preferred_phone");
  if (preferred) return preferred;

  const listed = notifyReportRecipient(input.reportRecipients);
  const report = tryPhone(listed?.phone, "report_recipient", listed?.name);
  if (report) {
    return report;
  }

  // Prefer a session whose chat belongs to a tenant campaigner.
  // Managers (מנהל צוות) win over regular campaigners when both have sessions.
  const rankedStaffPhones = [
    ...staff
      .filter((s) => isManagerStaffRole(s.role))
      .map((s) => normalizeNotifyPhone(s.phone)!),
    ...staff
      .filter((s) => !isManagerStaffRole(s.role))
      .map((s) => normalizeNotifyPhone(s.phone)!),
  ];

  for (const staffPhone of rankedStaffPhones) {
    const session = findSessionForPhone(sessions, staffPhone);
    if (!session) continue;
    return {
      chatId: session.chat_id,
      phone: normalizeNotifyPhone(session.phone) ?? staffPhone,
      contactName: contactNameFor(session, staff, staffPhone),
      source: "tenant_staff_session",
    };
  }

  // No matching session — use first manager/campaigner phone (managers first).
  const firstStaffPhone = staffPhones[0];
  if (firstStaffPhone) {
    return {
      chatId: firstStaffPhone,
      phone: firstStaffPhone,
      contactName:
        staff.find((s) => phonesMatch(s.phone, firstStaffPhone))?.full_name ??
        null,
      source: "tenant_staff_phone",
    };
  }

  return {
    chatId: "",
    phone: "",
    contactName: null,
    source: "none",
    reason:
      "No preferred phone, report recipient, or tenant campaigner session/phone found — refusing cross-tenant owner fallback",
  };
}

/** Resolve a name from the private session before the tenant staff card. */
function contactNameFor(
  session: NotifySessionCandidate | null,
  staff: Array<NotifyStaffCandidate>,
  phone: string,
): string | null {
  return (
    session?.contact_name ||
    session?.sender_name ||
    staff.find((s) => phonesMatch(s.phone, phone))?.full_name ||
    null
  );
}
