/**
 * Who may call claude-notify. Fails closed: the bearer must be
 * CLAUDE_MCP_BEARER (the shared secret claude_notify_david() reads from Vault)
 * or this project's service-role key. With CLAUDE_MCP_BEARER unset only the
 * service-role key is accepted.
 */

import { bearerToken } from "../_shared/automation-run-auth.ts";
import {
  isServiceKey,
  timingSafeEqualStr,
} from "../_shared/timing-safe-equal.ts";

export type NotifyAuthResult =
  { ok: true; via: "bearer" | "service_role" } | { ok: false };

/** Whether the Authorization header carries CLAUDE_MCP_BEARER or the service-role key, and which. */
export function authorizeNotifyRequest(input: {
  authorization: string | null | undefined;
  bearerSecret?: string | null;
  serviceRoleKey?: string | null;
}): NotifyAuthResult {
  const token = bearerToken(input.authorization);
  if (!token) {
    return { ok: false };
  }
  const secret = (input.bearerSecret || "").trim();
  if (secret && timingSafeEqualStr(token, secret)) {
    return { ok: true, via: "bearer" };
  }
  if (isServiceKey(token, (input.serviceRoleKey || "").trim())) {
    return { ok: true, via: "service_role" };
  }
  return { ok: false };
}
