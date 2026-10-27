/**
 * The refusals manage-manus-wa returns before a send reaches the Manus
 * gateway. Each answers null when the request may go on.
 */

import { bearerToken } from "../_shared/automation-run-auth.ts";
import { checkWhatsAppSend } from "../_shared/integration-guard.ts";
import {
  authorizeManusSend,
  isAnonToken,
  type ManusSendAuthInput,
} from "./send-auth.ts";

/** 401 for the public anon key, which no action accepts. */
export function anonRefusal(
  authHeader: string,
  serviceRoleKey: string,
  headers: Record<string, string>,
): Response | null {
  return isAnonToken(bearerToken(authHeader), serviceRoleKey)
    ? json({ error: "Unauthorized" }, 401, headers)
    : null;
}

/** 401/403/404 when this caller may not send from the integration (send-auth.ts). */
export async function manusSendRefusal(
  input: ManusSendAuthInput,
  headers: Record<string, string>,
): Promise<Response | null> {
  try {
    const auth = await authorizeManusSend(input);
    return auth.ok ? null : json({ error: auth.error }, auth.status, headers);
  } catch (err) {
    // A failed membership lookup must not reach the caller as Postgres text.
    console.error(
      "[manage-manus-wa] send_message auth lookup failed",
      err instanceof Error ? err.message : err,
    );
    return json({ error: "Internal error" }, 500, headers);
  }
}

/** 403 blocked_by_staging_safe_mode when the Staging outbound guard blocks this phone. */
export function stagingBlockResponse(
  phone: string,
  headers: Record<string, string>,
  check = checkWhatsAppSend,
): Response | null {
  const guard = check(phone);
  if (guard.decision !== "BLOCK") {
    return null;
  }
  console.warn("[manage-manus-wa] blocked by integration-guard", guard);
  return json(
    {
      error: "blocked_by_staging_safe_mode",
      reason: guard.reason,
      environment: guard.environment,
    },
    403,
    headers,
  );
}

/** A JSON response with the caller's CORS headers. */
function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
