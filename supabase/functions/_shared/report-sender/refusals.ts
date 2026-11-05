// What the WhatsApp senders return when they refuse a send before anything
// goes out (AIO-255). The codes are the keys the web app turns into Hebrew
// (src/components/report-sender/reportSenderMessages.ts).
import type { GuardResult } from "../integration-guard.ts";
import { type LineError, loadSenderLine } from "./line-access.ts";
import type { LineStore } from "./line-store.ts";
import type { ReportSenderType } from "./types.ts";

/** The HTTP status and JSON body of a refused send. */
export type SendRefusal = { status: number; body: Record<string, unknown> };

/**
 * The refusal for a user's text send that names a line they may not send
 * from (loadSenderLine), else null. A service-role call (broadcasts, the
 * report worker, Carmen) keeps the sender's own tenant check: those callers
 * pick the line themselves, and the worker checks it for the schedule's
 * creator.
 */
export async function namedLineRefusal(
  store: LineStore,
  input: {
    isServiceRole: boolean;
    tenantId: string;
    userId: string;
    integrationId: string | null | undefined;
    type: ReportSenderType;
  },
): Promise<SendRefusal | null> {
  const { integrationId } = input;
  if (input.isServiceRole || !integrationId) {
    return null;
  }
  const line = await loadSenderLine(store, { ...input, integrationId });
  return line ? null : lineRefusal("sender_not_allowed", input.type);
}

/** 403 for a line the caller may not use, 400 when no line is set up. */
export function lineRefusal(
  error: LineError,
  type: ReportSenderType,
): SendRefusal {
  return error === "sender_not_allowed"
    ? {
        status: 403,
        body: { error: "sender_not_allowed", code: "sender_not_allowed" },
      }
    : {
        status: 400,
        body: { error: NOT_CONFIGURED[type], code: "not_configured" },
      };
}

/** 403 when this environment may not send to the recipient (Staging). */
export function stagingRefusal(guard: GuardResult): SendRefusal {
  return {
    status: 403,
    body: {
      error: "blocked_by_staging_safe_mode",
      reason: guard.reason,
      environment: guard.environment,
    },
  };
}

/** The texts older clients match (reportSenderMessages.ts SERVER_TEXT_CODES). */
const NOT_CONFIGURED: Record<ReportSenderType, string> = {
  green_api: "Green API not configured",
  manus_wa: "Manus WhatsApp not configured",
};
