import type { CarmenReportRecipient } from "../carmen-report-recipients/resolve.ts";

export type NotifySessionCandidate = {
  chat_id: string;
  phone?: string | null;
  contact_name?: string | null;
  sender_name?: string | null;
  updated_at?: string | null;
};

/** Session row used to wire notify delivery (automation + connection user). */
export type NotifyBridgeSession = NotifySessionCandidate & {
  automation_id?: string | null;
  connection_user_id?: string | null;
};

export type NotifyStaffCandidate = {
  phone: string | null;
  full_name: string | null;
  /** campaigners.role entry, identity role_title, or tenant role string */
  role?: string | null;
};

export type ResolveCarmenNotifyTargetInput = {
  /** Explicit chat_id / phone from the caller (highest priority). */
  preferredPhone?: string | null;
  /** Whom the tenant's Carmen reports to (loadCarmenReportRecipients), in order. */
  reportRecipients?: Array<
    Pick<CarmenReportRecipient, "phone" | "name" | "source">
  >;
  /** Non-group carmen_whatsapp_sessions for the tenant (newest first preferred). */
  sessions: Array<NotifySessionCandidate>;
  /** Active tenant campaigners with phones (this tenant only). */
  staff: Array<NotifyStaffCandidate>;
};

export type ResolveCarmenNotifyTargetResult = {
  chatId: string;
  phone: string;
  contactName: string | null;
  source:
    | "preferred_phone"
    | "report_recipient"
    | "tenant_staff_session"
    | "tenant_staff_phone"
    | "none";
  reason?: string;
};
