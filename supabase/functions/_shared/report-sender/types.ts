// Report WhatsApp sender lines (AIO-255). Shared by the report worker and the
// web app, so keep this folder free of Deno and browser APIs.

/** Line types that may send reports. Meta Cloud numbers need templates. */
export const REPORT_SENDER_TYPES = ["green_api", "manus_wa"] as const;

export type ReportSenderType = (typeof REPORT_SENDER_TYPES)[number];

/** One row of the list_report_whatsapp_senders RPC. */
export type ReportSender = {
  id: string;
  integration_type: string;
  display_name: string | null;
  last4: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_tenant_id: string;
  owner_tenant_name: string | null;
  is_shared: boolean;
  carmen_role: string | null;
  ready: boolean;
  group_chat_ids: string[] | null;
  caller_can_manage: boolean;
};

/** The fields the resolver reads from a line. */
export type PickableSender = Pick<
  ReportSender,
  "id" | "integration_type" | "owner_user_id" | "is_shared" | "ready"
>;

/** Narrows a stored integration_type to a report sender type. */
export function isReportSenderType(value: string): value is ReportSenderType {
  return REPORT_SENDER_TYPES.some((type) => type === value);
}
