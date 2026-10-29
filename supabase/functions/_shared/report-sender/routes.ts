import type { ReportSenderType } from "./types.ts";

export type ReportPayload = "text" | "file";

/** The edge function that sends each payload from each line type. */
export const REPORT_SENDER_FUNCTIONS: Record<
  ReportSenderType,
  Record<ReportPayload, string>
> = {
  green_api: {
    text: "send-green-api-message",
    file: "send-green-api-file",
  },
  manus_wa: {
    text: "send-manus-wa-message",
    file: "send-manus-wa-file",
  },
};

/** Edge function name for a text or file report from a line type. */
export function reportSenderFunction(
  type: ReportSenderType,
  payload: ReportPayload,
): string {
  return REPORT_SENDER_FUNCTIONS[type][payload];
}
