import type { DbClient } from "../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../_shared/telephony/phone.ts";

/** The most messages one call passes to the team; each one is a WhatsApp to every recipient. */
export const MAX_MESSAGES_PER_CALL = 3;

/** The most calls one number may make to an org's line in CALLER_WINDOW_MS before it is limited. */
export const MAX_CALLS_PER_CALLER = 5;

/** The window MAX_CALLS_PER_CALLER counts over: one hour. */
export const CALLER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Whether this call from the number goes over the org's limit: the number already made
 * MAX_CALLS_PER_CALLER calls to the org in the last hour, matched by phone_match_key (the
 * caller_match_key column). Hidden numbers count together as one caller. A failed count throws,
 * so a call is never set up without the limit.
 */
export async function callerOverLimit(
  db: DbClient,
  tenantId: string,
  callerPhone: string | null,
): Promise<boolean> {
  const key = phoneMatchKey(callerPhone);
  const since = new Date(Date.now() - CALLER_WINDOW_MS).toISOString();
  const query = db
    .from("carmen_phone_calls")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("started_at", since);
  const { data, error } = await (
    key ? query.eq("caller_match_key", key) : query.is("caller_match_key", null)
  ).limit(MAX_CALLS_PER_CALLER);
  if (error) {
    throw new Error(`caller call count failed: ${error.message}`);
  }
  return (data ?? []).length >= MAX_CALLS_PER_CALLER;
}
