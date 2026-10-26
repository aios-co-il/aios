/**
 * Turn the HTTP response of send-manus-wa-message / send-green-api-message
 * into a delivery outcome, so callers report what really happened instead
 * of treating every 2xx as "sent".
 *
 * - 200 + success            → sent
 * - 202 (Manus timed out)    → delivery_unknown: the message may have left;
 *                              never retry it, or the recipient gets it twice
 * - 403 staging guard        → blocked_staging
 * - 200 duplicate skip       → duplicate_skipped (Green API's identical-send claim)
 * - anything else            → failed
 */

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

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

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
  if (httpStatus === 202 || b.delivered === "unknown") {
    return {
      ...base,
      sent: false,
      status: "delivery_unknown",
      error: error ?? "delivery_unknown",
    };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
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
        error: error ?? "send reported success:false",
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
  return {
    ...base,
    sent: false,
    status: "failed",
    error: error ?? `HTTP ${httpStatus}`,
  };
}

export async function readWaSendResponse(
  res: Response,
): Promise<WaSendOutcome> {
  const text = await res.text().catch(() => "");
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text.slice(0, 300) || null };
  }
  return interpretWaSendResponse(res.status, body);
}
