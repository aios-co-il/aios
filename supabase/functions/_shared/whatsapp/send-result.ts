/**
 * Turn the HTTP response of send-manus-wa-message / send-green-api-message
 * into a delivery outcome, so callers report what really happened instead
 * of treating every 2xx as "sent".
 *
 * - 200 + success            → sent
 * - 202 (Manus timed out)    → delivery_unknown: the message may have left;
 *                              never retry it, or the recipient gets it twice
 * - no response (network     → delivery_unknown too: the sender may already
 *   error), 504 or 546         have posted to the gateway before the call broke
 *                              or the edge runtime timed it out
 * - 403 staging guard        → blocked_staging
 * - 200 duplicate skip       → duplicate_skipped (Green API's identical-send claim)
 * - anything else            → failed: nothing left
 */

import type { SendKind } from "../client-card/send-kind.ts";

/** The only integration type send-manus-wa-message accepts with an integrationId. */
export const MANUS_WA_TYPES = ["manus_wa"];

/** Sends from a Manus line behind the Staging guard and records chat_messages. */
export const SEND_MANUS_FN = "send-manus-wa-message";

/**
 * HTTP statuses after which the message may already have left: Manus' own
 * 202, the edge gateway's 504 timeout and the runtime's 546 worker limit.
 */
const MAY_HAVE_LEFT_STATUSES = [202, 504, 546];

export type WaSendStatus =
  | "sent"
  | "delivery_unknown"
  | "blocked_staging"
  | "duplicate_skipped"
  | "failed";

export type WaSendOutcome = {
  sent: boolean;
  status: WaSendStatus;
  error: string | null;
  providerMessageId: string | null;
  httpStatus: number | null;
};

/** POSTs one send to a sender edge function as the service role and returns its real outcome; a network error is delivery_unknown. */
export async function postWaSend(input: {
  fetchImpl: typeof fetch;
  supabaseUrl: string;
  serviceRoleKey: string;
  functionName: string;
  /** What the send is: the client send guard judges each send by it (AIO-261). */
  sendKind: SendKind;
  body: Record<string, unknown>;
}): Promise<WaSendOutcome> {
  try {
    const res = await input.fetchImpl(
      `${input.supabaseUrl}/functions/v1/${input.functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.serviceRoleKey}`,
        },
        body: JSON.stringify({ ...input.body, sendKind: input.sendKind }),
      },
    );
    return await readWaSendResponse(res);
  } catch (e) {
    return {
      sent: false,
      status: "delivery_unknown",
      error: e instanceof Error ? e.message : String(e),
      providerMessageId: null,
      httpStatus: null,
    };
  }
}

/** Reads a sender response body (JSON or plain text) into a delivery outcome. */
export async function readWaSendResponse(
  res: Response,
): Promise<WaSendOutcome> {
  const text = await res.text().catch((e) => {
    // The status still decides the outcome; only the body is lost.
    console.warn(
      "[wa-send] response body unreadable",
      res.status,
      e instanceof Error ? e.message : e,
    );
    return "";
  });
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text.slice(0, 300) || null };
  }
  return interpretWaSendResponse(res.status, body);
}

/** Maps a sender's HTTP status and JSON body to a delivery outcome. */
export function interpretWaSendResponse(
  httpStatus: number,
  body: unknown,
): WaSendOutcome {
  const b = asRecord(body);
  const error = str(b.error);
  const base = { providerMessageId: null, httpStatus };

  if (httpStatus === 403 && error === "blocked_by_staging_safe_mode") {
    const reason = str(b.reason);
    return {
      ...base,
      sent: false,
      status: "blocked_staging",
      error: reason ? `${error}: ${reason}` : error,
    };
  }
  if (
    MAY_HAVE_LEFT_STATUSES.includes(httpStatus) ||
    b.delivered === "unknown"
  ) {
    return {
      ...base,
      sent: false,
      status: "delivery_unknown",
      error: error ?? "delivery_unknown",
    };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return interpretSuccessBody(b, httpStatus);
  }
  return {
    ...base,
    sent: false,
    status: "failed",
    error: error ?? `HTTP ${httpStatus}`,
  };
}

/** A 2xx body can still be a duplicate skip or an explicit success:false. */
function interpretSuccessBody(
  b: Record<string, unknown>,
  httpStatus: number,
): WaSendOutcome {
  const base = { providerMessageId: null, httpStatus };
  if (b.skipped === "duplicate_identical_whatsapp") {
    return {
      ...base,
      sent: false,
      status: "duplicate_skipped",
      error: "duplicate_identical_whatsapp",
    };
  }
  if (b.success === false) {
    return {
      ...base,
      sent: false,
      status: "failed",
      error: str(b.error) ?? "send reported success:false",
    };
  }
  return {
    sent: true,
    status: "sent",
    error: null,
    providerMessageId: str(b.messageId) ?? str(b.idMessage),
    httpStatus,
  };
}

/** The body's own fields, or {} when it is not an object. */
function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? Object.fromEntries(Object.entries(body))
    : {};
}

/** A non-blank string, or null. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
