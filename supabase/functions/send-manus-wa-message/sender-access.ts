/**
 * send-manus-wa-message's tenant-access step (_shared/auth/tenant-access.ts).
 * A failed membership, super-admin or sharing lookup becomes a generic 500:
 * the cause is logged, never returned to the caller.
 */

import {
  tenantUserAccess,
  type TenantUserAccess,
} from "../_shared/auth/tenant-access.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  sendLine,
  type LineDeps,
  type LineStep,
} from "../_shared/report-sender/text-line.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** Whether the user is a member of the tenant or a super admin, or the 500 to return. */
export async function senderAccess(
  admin: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  userId: string,
): Promise<TenantUserAccess | Response> {
  try {
    return await tenantUserAccess(admin, tenantId, userId);
  } catch (e) {
    return accessLookupFailure(e);
  }
}

/** The line this send uses (sendLine), or the 500 to return when a lookup fails. */
export async function senderLine(
  deps: LineDeps,
  input: Parameters<typeof sendLine>[1],
): Promise<LineStep | Response> {
  try {
    return await sendLine(deps, input);
  } catch (e) {
    return accessLookupFailure(e);
  }
}

/** Logs the failed lookup and answers 500 "Internal error". */
function accessLookupFailure(e: unknown): Response {
  console.error(
    "[send-manus-wa] access lookup failed",
    e instanceof Error ? e.message : e,
  );
  return new Response(JSON.stringify({ error: "Internal error" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
