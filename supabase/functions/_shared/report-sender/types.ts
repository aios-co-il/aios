// Report WhatsApp sender lines (AIO-255). Shared by the report worker and the
// web app, so keep this folder free of Deno and browser APIs.
import type { Database } from "../database.types.ts";

/** Line types that may send reports. Meta Cloud numbers need templates. */
export const REPORT_SENDER_TYPES = ["green_api", "manus_wa"] as const;

export type ReportSenderType = (typeof REPORT_SENDER_TYPES)[number];

type SenderRow =
  Database["public"]["Functions"]["list_report_whatsapp_senders"]["Returns"][number];

/** Columns the generated row types as always set, which the RPC can leave NULL. */
type NullableColumn =
  | "display_name"
  | "last4"
  | "owner_user_id"
  | "owner_name"
  | "owner_tenant_name"
  | "carmen_role"
  | "group_chat_ids";

/** One row of the list_report_whatsapp_senders RPC. */
export type ReportSender = Omit<SenderRow, NullableColumn> & {
  [Column in NullableColumn]: SenderRow[Column] | null;
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
